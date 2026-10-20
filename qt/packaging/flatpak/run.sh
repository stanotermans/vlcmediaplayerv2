#!/bin/bash
# The installed Flatpak as one program, for smoke.py and tests/run.py: their VLCR_* settings go into the sandbox
# with --env (flatpak run does not pass them on by itself).
args=()
while IFS='=' read -r k v; do args+=("--env=$k=$v"); done < <(env | grep '^VLCR_')
exec flatpak run --user "${args[@]}" io.github.stanotermans.VLCRedesign "$@"
