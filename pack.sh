#!/bin/sh
# Builds the zip to upload to extensions.gnome.org.
set -eu
cd "$(dirname "$0")"
extra=""
for f in *.js; do
    case "$f" in extension.js|prefs.js) ;; *) extra="$extra --extra-source=$f" ;; esac
done
# shellcheck disable=SC2086
gnome-extensions pack --force $extra --extra-source=LICENSE \
    --schema=schemas/org.gnome.shell.extensions.study-desk.gschema.xml .
