import hero from '../assets/sakura/yachiyo-lake.webp';
import articleCover from '../assets/sakura/moonlit-shrine.webp';
import galleryCover from '../assets/sakura/yachiyo-portrait.webp';
import pixelCover from '../assets/sakura/sakura-station.webp';
import summerHero from '../assets/seasons/summer-v1/hero-scene.webp';
import summerArticle from '../assets/seasons/summer-v1/sparkler-cover.webp';
import summerGallery from '../assets/seasons/summer-v1/background-light.webp';
import summerPixel from '../assets/seasons/summer-v1/pixel-workshop.webp';
import autumnHero from '../assets/seasons/autumn-v1/hero-scene.webp';
import autumnArticle from '../assets/seasons/autumn-v1/article-cover.webp';
import autumnGallery from '../assets/seasons/autumn-v1/background-light.webp';
import autumnPixel from '../assets/seasons/autumn-v1/pixel-workshop.webp';
import winterHero from '../assets/seasons/winter-v1/hero-scene.webp';
import winterArticle from '../assets/seasons/winter-v1/article-cover.webp';
import winterGallery from '../assets/seasons/winter-v1/background-light.webp';
import winterPixel from '../assets/seasons/winter-v1/pixel-workshop.webp';
import { activeSeason } from '../composables/useSeasonTheme';

// Bundled, fingerprinted artwork. User-provided covers always take precedence.
const spring = { hero, articleCover, galleryCover, pixelCover };
const summer = { hero: summerHero, articleCover: summerArticle, galleryCover: summerGallery, pixelCover: summerPixel };
const autumn = { hero: autumnHero, articleCover: autumnArticle, galleryCover: autumnGallery, pixelCover: autumnPixel };
const winter = { hero: winterHero, articleCover: winterArticle, galleryCover: winterGallery, pixelCover: winterPixel };
const seasonalArtwork = { spring, summer, autumn, winter };
// Getters track the reactive season inside Vue render/computed effects. URLs
// alone do not fetch images; only artwork actually displayed is downloaded.
export function seasonalArt(key) { return (seasonalArtwork[activeSeason.value] || spring)[key]; }
export const siteArt = Object.freeze(Object.defineProperties({}, Object.fromEntries(
  Object.keys(spring).map(key => [key, { enumerable: true, get: () => seasonalArt(key) }])
)));
