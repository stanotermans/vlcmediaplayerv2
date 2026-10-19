{
  "targets": [{
    "target_name": "vlcview",
    "sources": ["vlcview.c"],
    "conditions": [
      ["OS=='win'", { "defines": ["UNICODE", "_UNICODE"] }],
      ["OS=='linux'", { "cflags": ["-std=gnu11"], "libraries": ["-ldl"] }],
      ["OS=='mac'", { "xcode_settings": { "OTHER_CFLAGS": ["-std=gnu11"], "MACOSX_DEPLOYMENT_TARGET": "11.0" } }]
    ]
  }]
}
