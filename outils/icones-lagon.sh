#!/usr/bin/env bash
# Recompose l'icône PWA depuis la planche illustrée du jeu (ImageMagick).
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
convert -size 512x512 gradient:'#126763-#072e40' -fill none -stroke '#387d78' -strokewidth 2 -draw 'circle 250,251 427,251' -stroke none -fill '#b6f6df' -draw "path 'M -20,439 Q 218,326 523,64 Q 290,300 -20,450 Z'" "$tmp/fond.png"
fruit=public/assets/fruits/illustres/letchi-v1.webp
convert "$fruit" -crop 512x512+512+0 +repage -trim +repage -background none -rotate -27 -trim +repage -resize 175x212 "$tmp/g.png"
convert "$fruit" -crop 512x512+1024+0 +repage -trim +repage -background none -rotate 23 -trim +repage -resize 165x205 "$tmp/d.png"
convert "$tmp/fond.png" "$tmp/g.png" -geometry +91+136 -composite "$tmp/d.png" -geometry +255+176 -composite "$tmp/icon.png"
for n in 180 192 512; do convert "$tmp/icon.png" -resize "${n}x${n}" -strip "public/icons/lagon-$n.png"; done
for n in 192 512; do convert "$tmp/icon.png" -resize 450x450 -background '#0b454b' -gravity center -extent 512x512 -resize "${n}x${n}" -strip "public/icons/lagon-$n-maskable.png"; done
