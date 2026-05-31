import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { basename } from 'path'
import fastGlob from 'fast-glob'

const outDir = 'src/public/images'
mkdirSync(outDir, { recursive: true })

const files = await fastGlob('src/images/*.svg')
for (const file of files) {
  const name = basename(file, '.svg')
  const svg = readFileSync(file)
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 128 }
  })
  const out = `${outDir}/${name}.png`
  writeFileSync(out, resvg.render().asPng())
  console.log(`  ✓ ${file} → ${out}`)
}
