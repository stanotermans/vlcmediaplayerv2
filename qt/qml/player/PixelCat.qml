// The pixel cat of the idle player (v2.x catSVG). Its pixels are grouped (body, eyes, mouth, tail) so a click can
// animate them (#48): it blinks, wags, jumps, spins, says meow or sends hearts.
import QtQuick
import VLCR

Item {
  id: cat
  property bool clickable: false
  readonly property var rows: [
    "..K..........K....", "..KW........WK....", "..KWW......WWK....", "..KWWWWWWWWWWK....", "..KWWWWWWWWWWK....",
    "KKWKKWWWWWWKKWKK..", "..WWWWWWWWWWWWW...", "KKWPPWKWWKWPPWKK..", "..WWWWWKKKWWWWW...", "....WWWWWWWWW.....",
    "....WWWWWWWWW.....", "....WWWWWWWWW..W..", "....WGWWWWWWW...W.", "....WGWWWWWWWW..W.", "....WGWWWGWWWW.WW.",
    "....WGWWWGWWWWWW..", "....W.W.W.W.WW...."
  ]
  function part(x, y) { return y === 7 && (x === 6 || x === 9) ? "eyes" : y === 8 && x >= 7 && x <= 9 ? "mouth" : (x >= 15 && y >= 11) || (y === 15 && x === 14) ? "tail" : "body"; }
  function svg(which) {
    const C = { W: "#ececec", K: "#111", P: "#f6b8c4", G: "#a8a8a8" };
    let r = "";
    rows.forEach((row, y) => [...row].forEach((c, x) => { if (C[c] && part(x, y) === which) r += '<rect x="' + x + '" y="' + y + '" width="1.02" height="1.02" fill="' + C[c] + '"/>'; }));
    return "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 17" shape-rendering="crispEdges">' + r + "</svg>");
  }
  implicitWidth: 180; implicitHeight: width * 17 / 18
  property string trick: ""
  property string lastTrick: ""
  function play() {
    if (trick) return;
    const names = ["meow", "blink", "wag", "jump", "spin", "hearts"].filter(n => n !== lastTrick);
    trick = lastTrick = names[Math.floor(Math.random() * names.length)];
    anim[trick]();
    done.restart();
  }
  readonly property var anim: ({
    meow: () => { mouthA.restart(); say.visible = true; sayA.restart(); },
    blink: () => blinkA.restart(), wag: () => wagA.restart(), jump: () => jumpA.restart(), spin: () => spinA.restart(),
    hearts: () => { for (let i = 0; i < 5; i++) heart.createObject(cat, { x: cat.width * (0.15 + Math.random() * 0.7), delay: i * 120 }); }
  })
  Timer { id: done; interval: 1400; onTriggered: { cat.trick = ""; say.visible = false; } }

  Item {
    id: body
    width: parent.width; height: parent.height
    transformOrigin: Item.Bottom
    Image { anchors.fill: parent; source: cat.svg("body"); smooth: false; sourceSize: Qt.size(180, 170) }
    Image { id: tail; anchors.fill: parent; source: cat.svg("tail"); smooth: false; sourceSize: Qt.size(180, 170)
            transform: Rotation { id: tailRot; origin.x: cat.width * 15 / 18; origin.y: cat.height * 17 / 17 } }
    Image { id: eyes; anchors.fill: parent; source: cat.svg("eyes"); smooth: false; sourceSize: Qt.size(180, 170)
            transform: Scale { id: eyeScale; origin.y: cat.height * 7.5 / 17 } }
    Image { id: mouth; anchors.fill: parent; source: cat.svg("mouth"); smooth: false; sourceSize: Qt.size(180, 170)
            transform: Scale { id: mouthScale; origin.y: cat.height * 8 / 17 } }
  }
  SequentialAnimation { id: blinkA; loops: 2; NumberAnimation { target: eyeScale; property: "yScale"; to: 0.1; duration: 120 } NumberAnimation { target: eyeScale; property: "yScale"; to: 1; duration: 130 } }
  SequentialAnimation { id: mouthA; NumberAnimation { target: mouthScale; property: "yScale"; to: 2.2; duration: 200 } PauseAnimation { duration: 200 } NumberAnimation { target: mouthScale; property: "yScale"; to: 1; duration: 200 } }
  SequentialAnimation { id: wagA; loops: 3; NumberAnimation { target: tailRot; property: "angle"; to: 18; duration: 175; easing.type: Easing.InOutSine } NumberAnimation { target: tailRot; property: "angle"; to: 0; duration: 175; easing.type: Easing.InOutSine } }
  SequentialAnimation { id: jumpA
    NumberAnimation { target: body; property: "y"; to: -cat.height * 0.25; duration: 320; easing.type: Easing.OutQuad }
    NumberAnimation { target: body; property: "y"; to: 0; duration: 480; easing.type: Easing.OutBounce } }
  NumberAnimation { id: spinA; target: body; property: "rotation"; from: 0; to: 360; duration: 900; easing.type: Easing.InOutQuad }
  Rectangle {   // .cat-say
    id: say
    visible: false
    x: cat.width * 0.85; y: -cat.height * 0.1
    width: st.implicitWidth + 20; height: st.implicitHeight + 8; radius: 10; color: "#ffffff"
    T { id: st; anchors.centerIn: parent; text: qsTr("Meow!"); color: "#111111"; font.weight: Font.Bold; px: Math.max(12, Math.min(18, cat.width / 12)) }
    Canvas { x: 10; y: parent.height - 1; width: 12; height: 6
             onPaint: { const g = getContext("2d"); g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(0, 0); g.lineTo(12, 0); g.lineTo(6, 6); g.fill(); } }
    NumberAnimation on opacity { id: sayA; from: 1; to: 0; duration: 1300; easing.type: Easing.InQuart; running: false }
  }
  Component {
    id: heart
    T {
      property int delay: 0
      text: "♥"; color: "#f6b8c4"; px: Math.max(14, Math.min(24, cat.width / 9)); y: cat.height * 0.2; opacity: 0
      SequentialAnimation on y { running: true
        PauseAnimation { duration: delay } NumberAnimation { to: -cat.height * 0.3; duration: 1200; easing.type: Easing.OutQuad } }
      SequentialAnimation on opacity { running: true
        PauseAnimation { duration: delay } NumberAnimation { to: 1; duration: 200 } NumberAnimation { to: 0; duration: 1000 } ScriptAction { script: destroy() } }
    }
  }
  MouseArea { anchors.fill: parent; enabled: cat.clickable; cursorShape: Qt.PointingHandCursor; onClicked: cat.play(); onDoubleClicked: {} }
}
