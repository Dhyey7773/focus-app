import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets/quiet-brand-sheet.png');
const out = join(root, 'icons');

/** Crop regions tuned to the 1024×948 brand sheet layout */
const crops = [
  /* Large 3/4 hero — mascot only (no headline text) */
  { name: 'quiet-hero.png', left: 228, top: 128, width: 200, height: 268 },
  /* Landing / marketing — includes Quiet title lockup */
  { name: 'quiet-hero-lockup.png', left: 52, top: 38, width: 360, height: 400 },
  /* Views row */
  { name: 'quiet-front.png', left: 44, top: 728, width: 178, height: 178 },
  { name: 'quiet-3quarter.png', left: 228, top: 728, width: 178, height: 178 },
  /* App icon — front face from Views row, scaled to PWA sizes below */
  { name: 'quiet-icon.png', left: 44, top: 728, width: 178, height: 178 },
  /* Expression row — matches brand sheet moods */
  { name: 'quiet-mood-focused.png', left: 36, top: 478, width: 148, height: 158 },
  { name: 'quiet-mood-thinking.png', left: 178, top: 478, width: 148, height: 158 },
  { name: 'quiet-mood-encouraging.png', left: 320, top: 478, width: 148, height: 158 },
  { name: 'quiet-mood-celebrating.png', left: 462, top: 478, width: 148, height: 158 },
  { name: 'quiet-mood-reminder.png', left: 604, top: 478, width: 148, height: 158 },
  { name: 'quiet-mood-rest.png', left: 746, top: 478, width: 148, height: 158 },
];

for (const c of crops) {
  await sharp(src)
    .extract({ left: c.left, top: c.top, width: c.width, height: c.height })
    .png()
    .toFile(join(out, c.name));
  console.log('Wrote icons/' + c.name);
}

// PWA icons — front face on brand background
const iconBg = { r: 7, g: 8, b: 10, alpha: 1 };
for (const size of [512, 192]) {
  await sharp(join(out, 'quiet-icon.png'))
    .resize(size, size, { fit: 'contain', background: iconBg })
    .png()
    .toFile(join(out, `icon-${size}.png`));
}
console.log('Wrote icon-512.png and icon-192.png');
