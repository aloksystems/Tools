import type { FormatId } from '@/types/converter'

/** Extension groups used by the native open-dialog filters. Detection itself is
 *  done on file signatures in Rust, never from these. */
export const FORMAT_EXTENSIONS: Record<FormatId, string[]> = {
  jpeg: ['jpg', 'jpeg'],
  png: ['png'],
  webp: ['webp'],
  avif: ['avif'],
  bmp: ['bmp', 'dib'],
  tiff: ['tif', 'tiff'],
  gif: ['gif'],
  ico: ['ico'],
  svg: ['svg'],
  heic: ['heic', 'heif'],
  pdf: ['pdf'],
  docx: ['docx'],
  doc: ['doc'],
  odt: ['odt'],
  rtf: ['rtf'],
  txt: ['txt', 'md', 'log'],
  html: ['html', 'htm'],
  xlsx: ['xlsx'],
  xls: ['xls'],
  ods: ['ods'],
  csv: ['csv'],
  pptx: ['pptx'],
  ppt: ['ppt'],
  odp: ['odp'],
  mp3: ['mp3'],
  wav: ['wav'],
  flac: ['flac'],
  aac: ['aac'],
  m4a: ['m4a', 'm4b'],
  wma: ['wma'],
  aiff: ['aiff', 'aif', 'aifc'],
  alac: ['m4a'],
  ogg: ['ogg', 'oga'],
  opus: ['opus'],
  mp4: ['mp4'],
  mkv: ['mkv'],
  mov: ['mov'],
  avi: ['avi'],
  webm: ['webm'],
  wmv: ['wmv'],
  flv: ['flv'],
  mpeg: ['mpeg', 'mpg', 'mpe'],
  threeGp: ['3gp', '3gpp'],
  zip: ['zip'],
  sevenZ: ['7z'],
  tar: ['tar'],
  gz: ['gz', 'tgz'],
  bz2: ['bz2'],
  xz: ['xz'],
  tarGz: ['tar.gz', 'tgz'],
  tarBz2: ['tar.bz2', 'tbz2'],
  tarXz: ['tar.xz', 'txz'],
  wim: ['wim', 'swm', 'esd'],
  cab: ['cab'],
  unknown: [],
}

export function extensionsFor(formats: FormatId[]): string[] {
  const out = new Set<string>()
  for (const format of formats) {
    for (const extension of FORMAT_EXTENSIONS[format] ?? []) out.add(extension)
  }
  return [...out]
}
