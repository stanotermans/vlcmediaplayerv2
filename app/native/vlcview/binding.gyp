{
  "targets": [{
    "target_name": "vlcview",
    "conditions": [["OS=='win'", { "sources": ["vlcview.c"], "defines": ["UNICODE", "_UNICODE"] }]]
  }]
}
