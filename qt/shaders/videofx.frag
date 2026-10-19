// The video filters of v2.x (effects.js filterString: CSS and SVG filters on the picture), in the same order:
// gamma, sharpen, posterize, then brightness, contrast, saturate, hue-rotate, sepia, grayscale, invert; and the film
// grain on top. The CSS formulas are those of the Filter Effects spec.
#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float brightness;   // 1 = as is
    float contrast;
    float saturate;
    float hue;          // radians
    float sepia;        // 0…1
    float gray;         // 0 or 1
    float negate;       // 0 or 1
    float posterize;    // 0 or 1
    float gamma;        // 1 = as is
    float sharpen;      // 0…2
    float grain;        // 0…10
    float time;
    vec2 texel;         // one source pixel
};
layout(binding = 1) uniform sampler2D source;

float rand(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
    vec4 px = texture(source, qt_TexCoord0);
    vec3 c = px.rgb;
    if (gamma != 1.0) c = pow(c, vec3(1.0 / gamma));
    if (sharpen > 0.0) {
        float k = sharpen / 2.0;
        vec3 n = texture(source, qt_TexCoord0 + vec2(0.0, -texel.y)).rgb + texture(source, qt_TexCoord0 + vec2(0.0, texel.y)).rgb
               + texture(source, qt_TexCoord0 + vec2(-texel.x, 0.0)).rgb + texture(source, qt_TexCoord0 + vec2(texel.x, 0.0)).rgb;
        c = clamp(c * (1.0 + 4.0 * k) - n * k, 0.0, 1.0);
    }
    if (posterize > 0.5) c = min(floor(c * 5.0) / 4.0, vec3(1.0));
    c *= brightness;
    c = (c - 0.5) * contrast + 0.5;
    if (saturate != 1.0) {
        float s = saturate;
        c = mat3(0.213 + 0.787 * s, 0.213 - 0.213 * s, 0.213 - 0.213 * s,
                 0.715 - 0.715 * s, 0.715 + 0.285 * s, 0.715 - 0.715 * s,
                 0.072 - 0.072 * s, 0.072 - 0.072 * s, 0.072 + 0.928 * s) * c;
    }
    if (hue != 0.0) {
        float co = cos(hue), si = sin(hue);
        c = mat3(0.213 + co * 0.787 - si * 0.213, 0.213 - co * 0.213 + si * 0.143, 0.213 - co * 0.213 - si * 0.787,
                 0.715 - co * 0.715 - si * 0.715, 0.715 + co * 0.285 + si * 0.140, 0.715 - co * 0.715 + si * 0.715,
                 0.072 - co * 0.072 + si * 0.928, 0.072 - co * 0.072 - si * 0.283, 0.072 + co * 0.928 + si * 0.072) * c;
    }
    if (sepia > 0.0) {
        float a = 1.0 - sepia;
        c = mat3(0.393 + 0.607 * a, 0.349 - 0.349 * a, 0.272 - 0.272 * a,
                 0.769 - 0.769 * a, 0.686 + 0.314 * a, 0.534 - 0.534 * a,
                 0.189 - 0.189 * a, 0.168 - 0.168 * a, 0.131 + 0.869 * a) * c;
    }
    if (gray > 0.5) c = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722)));
    if (negate > 0.5) c = 1.0 - c;
    if (grain > 0.0) {   // an overlay of moving noise (v2.x: a noise canvas over the picture, opacity grain/10 × 0.35)
        float n = rand(floor(qt_TexCoord0 / texel / 2.0) + vec2(time * 61.0, time * 37.0));
        vec3 o = mix(2.0 * c * n, 1.0 - 2.0 * (1.0 - c) * (1.0 - n), step(0.5, c));
        c = mix(c, o, grain / 10.0 * 0.35);
    }
    fragColor = vec4(clamp(c, 0.0, 1.0), 1.0) * px.a * qt_Opacity;
}
