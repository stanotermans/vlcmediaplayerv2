#!/bin/bash

# rpm passes 1 and deb passes "upgrade" while updating; then the new version's links stay as they are.
# pacman only runs this on removal.
case "$1" in
    1|upgrade|failed-upgrade|abort-*) ;;
    *)
        # Delete the link to the binary
        if type update-alternatives >/dev/null 2>&1; then
            update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}' >/dev/null 2>&1 || true
        fi
        if [ -L '/usr/bin/${executable}' ] && [ ! -e '/usr/bin/${executable}' ]; then rm -f '/usr/bin/${executable}'; fi
        # and the link for shortcuts from before 1.10.3 (#39), see after-install.tpl
        if [ -L '/opt/VLC Redesign/${executable}' ]; then
            rm -f '/opt/VLC Redesign/${executable}'
            rmdir '/opt/VLC Redesign' 2>/dev/null || true
        fi
        ;;
esac
