#!/bin/sh
# The server half of scripts/deploy.sh. deploy.sh pipes this file to `ssh HOST sh -eu -s -- ARGS`
# (or to a local `sh` with MEALSPLIT_DEPLOY_LOCAL=1), so nothing needs installing on the server.
#
# Arguments: action (prepare | activate | rollback | list), deploy path, then action arguments.
# POSIX sh plus GNU `mv -T` (Debian) for the atomic symlink switch.
set -eu

umask 022
action="$1"
base="$2"
releases="$base/releases"

current() {
	if [ -L "$base/current" ]; then basename "$(readlink "$base/current")"; fi
}

# Release directories, oldest first. Names start with a UTC timestamp, so sorting is by age.
list_releases() {
	for dir in "$releases"/*; do
		name="${dir##*/}"
		# Complete releases only: skip *.partial uploads and anything else in the directory.
		if [ -d "$dir" ] && printf '%s\n' "$name" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[0-9a-f]+(-dirty)?$'; then
			printf '%s\n' "$name"
		fi
	done | sort
}

switch_to() {
	[ -f "$releases/$1/index.html" ] || { echo "release $1 has no index.html" >&2; exit 1; }
	rm -f "$base/current.new"
	ln -s "releases/$1" "$base/current.new"
	mv -T "$base/current.new" "$base/current"
	echo "now serving $1"
}

case "$action" in
prepare)
	if [ ! -d "$base" ] || [ ! -w "$base" ]; then
		echo "$base must exist and be owned by $(id -un); see docs/DEPLOY.md (one-time setup)" >&2
		exit 1
	fi
	mkdir -p "$releases"
	current
	;;
activate)
	id="$3"
	keep="$4"
	if [ ! -f "$releases/$id.partial/index.html" ] || [ ! -f "$releases/$id.partial/sw.js" ]; then
		echo "upload of $id is incomplete" >&2
		exit 1
	fi
	if [ -e "$releases/$id" ]; then
		echo "release $id already exists; wait a second and deploy again" >&2
		exit 1
	fi
	chmod -R u+rwX,go+rX,go-w "$releases/$id.partial"
	mv "$releases/$id.partial" "$releases/$id"
	switch_to "$id"
	# Leftovers from failed uploads, then all but the newest $keep releases (never the live one).
	find "$releases" -mindepth 1 -maxdepth 1 -name '*.partial' -exec rm -rf {} +
	live="$(current)"
	count="$(list_releases | wc -l)"
	extra=$((count - keep))
	if [ "$extra" -gt 0 ]; then
		list_releases | head -n "$extra" | while IFS= read -r old; do
			if [ "$old" != "$live" ]; then
				rm -rf "${releases:?}/$old"
				echo "removed old release $old"
			fi
		done
	fi
	;;
rollback)
	live="$(current)"
	[ -n "$live" ] || { echo "nothing is deployed yet" >&2; exit 1; }
	previous="$(list_releases | awk -v live="$live" '$0 == live { print prev; exit } { prev = $0 }')"
	[ -n "$previous" ] || { echo "no release older than $live to roll back to" >&2; exit 1; }
	switch_to "$previous"
	;;
list)
	live="$(current)"
	list_releases | while IFS= read -r r; do
		if [ "$r" = "$live" ]; then echo "* $r"; else echo "  $r"; fi
	done
	;;
*)
	echo "unknown server action: $action" >&2
	exit 2
	;;
esac
