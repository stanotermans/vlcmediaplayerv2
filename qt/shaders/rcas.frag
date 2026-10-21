// #81: sharp upscaling, step 2: RCAS, the contrast-adaptive sharpening of AMD FidelityFX Super Resolution 1
// (MIT licence, © Advanced Micro Devices), on the upscaled picture: each pixel is sharpened as far as its four
// neighbours allow without clipping, so edges get crisp without halos or noise.
#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 texel;         // one pixel of the upscaled picture
    float sharpness;    // in stops: 0 = the most, 2 = a quarter
};
layout(binding = 1) uniform sampler2D source;

void main() {
    vec3 b = texture(source, qt_TexCoord0 + vec2(0.0, -texel.y)).rgb;
    vec3 d = texture(source, qt_TexCoord0 + vec2(-texel.x, 0.0)).rgb;
    vec3 e = texture(source, qt_TexCoord0).rgb;
    vec3 f = texture(source, qt_TexCoord0 + vec2(texel.x, 0.0)).rgb;
    vec3 h = texture(source, qt_TexCoord0 + vec2(0.0, texel.y)).rgb;
    vec3 mn4 = min(min(b, d), min(f, h));
    vec3 mx4 = max(max(b, d), max(f, h));
    vec3 hitMin = mn4 / (4.0 * mx4 + 1e-5);
    vec3 hitMax = (1.0 - mx4) / (4.0 * mn4 - 4.0 - 1e-5);
    vec3 lobeRGB = max(-hitMin, hitMax);
    float lobe = max(-0.1875, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * exp2(-sharpness);
    vec3 c = (lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0);
    fragColor = vec4(clamp(c, 0.0, 1.0), 1.0) * qt_Opacity;
}
