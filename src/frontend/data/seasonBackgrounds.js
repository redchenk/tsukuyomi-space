import springLight from '../assets/sakura/moonwhite-lake.webp';
import springDark from '../assets/sakura/moonlit-shrine.webp';
import summerLight from '../assets/seasons/summer-v1/background-light.webp';
import summerDark from '../assets/seasons/summer-v1/background-dark.webp';
import autumnLight from '../assets/seasons/autumn-v2/background-light.webp';
import autumnDark from '../assets/seasons/autumn-v2/background-dark.webp';
import winterLight from '../assets/seasons/winter-v1/background-light.webp';
import winterDark from '../assets/seasons/winter-v1/background-dark.webp';

// Imports are URLs; the browser downloads only the background in use.
export const seasonBackgrounds = {
  spring: { light: springLight, dark: springDark },
  summer: { light: summerLight, dark: summerDark },
  autumn: { light: autumnLight, dark: autumnDark },
  winter: { light: winterLight, dark: winterDark }
};
