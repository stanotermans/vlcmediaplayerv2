#!/bin/bash
# Versions up to 1.10.2 were installed in "/opt/VLC Redesign". Shortcuts people made back then (panel, desktop,
# their own .desktop files) still start that path, so it gets a link to the app in its new place (#39).
# Only when nothing is there: a folder or file someone put there is left alone.
if [ ! -e '/opt/VLC Redesign/vlc-redesign' ] && [ ! -L '/opt/VLC Redesign/vlc-redesign' ]; then
    mkdir -p '/opt/VLC Redesign' && ln -s '/opt/vlc-redesign/vlc-redesign' '/opt/VLC Redesign/vlc-redesign' || true
fi
