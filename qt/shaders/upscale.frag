// #81: sharp upscaling, step 1: the picture at its own size scaled up with Catmull-Rom (bicubic) in 9 texture reads
// (bilinear reads that each combine 4 texels), instead of the soft bilinear scaling of the graphics card. Step 2 is
// rcas.frag.
#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 srcSize;       // the picture in pixels
};
layout(binding = 1) uniform sampler2D source;

void main() {
    vec2 p = qt_TexCoord0 * srcSize;
    vec2 t1 = floor(p - 0.5) + 0.5;
    vec2 f = p - t1;
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    vec2 w3 = f * f * (-0.5 + 0.5 * f);
    vec2 w12 = w1 + w2;
    vec2 t0 = (t1 - 1.0) / srcSize, t3 = (t1 + 2.0) / srcSize, t12 = (t1 + w2 / w12) / srcSize;
    vec3 c = texture(source, vec2(t0.x, t0.y)).rgb * w0.x * w0.y + texture(source, vec2(t12.x, t0.y)).rgb * w12.x * w0.y
           + texture(source, vec2(t3.x, t0.y)).rgb * w3.x * w0.y
           + texture(source, vec2(t0.x, t12.y)).rgb * w0.x * w12.y + texture(source, vec2(t12.x, t12.y)).rgb * w12.x * w12.y
           + texture(source, vec2(t3.x, t12.y)).rgb * w3.x * w12.y
           + texture(source, vec2(t0.x, t3.y)).rgb * w0.x * w3.y + texture(source, vec2(t12.x, t3.y)).rgb * w12.x * w3.y
           + texture(source, vec2(t3.x, t3.y)).rgb * w3.x * w3.y;
    fragColor = vec4(clamp(c, 0.0, 1.0), 1.0) * qt_Opacity;
}
