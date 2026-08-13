# Emscripten port shim for FreeType, in the style of the upstream
# os/emscripten/cmake/FindSDL2.cmake. Copy this file into
# external/OpenTTD/os/emscripten/cmake/ before you configure the build.
# The upstream wasm build does not compile FreeType, so it cannot show
# Chinese text. This shim maps find_package(Freetype) to the emscripten
# FreeType port and makes the zh_CN UI possible.
add_library(Freetype::Freetype INTERFACE IMPORTED)
set_target_properties(Freetype::Freetype PROPERTIES
        INTERFACE_COMPILE_OPTIONS "-sUSE_FREETYPE=1"
        INTERFACE_LINK_LIBRARIES "-sUSE_FREETYPE=1"
)

set(Freetype_FOUND on)
set(FREETYPE_FOUND on)
