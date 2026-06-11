import { ImageSourcePropType } from 'react-native';

export const RATING_IMAGES: ImageSourcePropType[] = [
  require('../assets/images/ratings/1.png'),
  require('../assets/images/ratings/2.png'),
  require('../assets/images/ratings/3.png'),
  require('../assets/images/ratings/4.png'),
  require('../assets/images/ratings/5.png'),
];

// The source PNGs use equal canvases but not equal painted bounds, so we
// normalize the visible face size at render time.
export const RATING_IMAGE_SCALES = [1, 1.08, 1.03, 1.11, 1.1];
export const RATING_IMAGE_BASELINE_OFFSETS = [0.011324, 0.037352, 0.012911, 0.033573, 0];
