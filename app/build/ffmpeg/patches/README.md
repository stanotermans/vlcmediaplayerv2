# Patches for libdvdread / libdvdnav

Taken unchanged from VLC 3.0.24 (`contrib/src/dvdread` and `contrib/src/dvdnav`, by the VideoLAN team),
applied in the same way VLC does: robustness fixes for broken DVDs and struct packing fixes.
VLC's `configure.ac` patch for libdvdnav (no `-mno-ms-bitfields`) is done in `build.sh` with `sed` on the
generated `configure` script, so no autoreconf is needed.
