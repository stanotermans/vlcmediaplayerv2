// #78: a 360° video (equirectangular: longitude across, latitude down) seen through a camera that looks around.
// Each screen pixel becomes a ray from the centre of the sphere; its direction picks the pixel of the picture.
#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float yaw;      // radians, + = turn right
    float pitch;    // radians, + = look up
    float fov;      // vertical field of view, radians
    float aspect;   // width / height of the view
};
layout(binding = 1) uniform sampler2D source;

const float PI = 3.14159265358979;

void main() {
    vec2 p = qt_TexCoord0 * 2.0 - 1.0;
    float t = tan(fov * 0.5);
    vec3 d = normalize(vec3(p.x * t * aspect, -p.y * t, 1.0));
    // pitch (around x), then yaw (around y)
    float cp = cos(pitch), sp = sin(pitch);
    d = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
    float cy = cos(yaw), sy = sin(yaw);
    d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
    float lon = atan(d.x, d.z);                 // -π … π, 0 = the middle of the picture
    float lat = asin(clamp(d.y, -1.0, 1.0));    // -π/2 … π/2
    vec2 uv = vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 - lat / PI);
    fragColor = texture(source, uv) * qt_Opacity;
}
