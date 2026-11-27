/**
 * @module features/pins/appearancePresets
 * Curated presets for Section 1 (Appearance Emoji Picker, Height Selector, Personality & Vibe Tags)
 * and Section 4 (Intimacy Suite Hookup Locations & Intimate Tags) in the New Connection modal.
 */

/**
 * Gender preset mode for the Interactive Appearance Emoji Picker.
 */
export type AppearanceGenderMode = 'women' | 'men';

/**
 * Appearance preset tile with emoji, label, and short sub-description.
 */
export interface AppearancePresetItem {
  id: string;
  emoji: string;
  label: string;
  description: string;
}

/**
 * Hair color & look presets per gender mode.
 */
export const HAIR_LOOK_PRESETS: Record<AppearanceGenderMode, ReadonlyArray<AppearancePresetItem>> = {
  women: [
    { id: 'brunette', emoji: '👩🏽', label: 'Brunette', description: 'Warm chestnut & rich tones' },
    { id: 'light-brunette', emoji: '👩🏼', label: 'Light Brunette', description: 'Honey & caramel highlights' },
    { id: 'blonde', emoji: '👱‍♀️', label: 'Blonde', description: 'Golden, sunlit or platinum' },
    { id: 'dark-black', emoji: '👩🏻', label: 'Dark/Black Hair', description: 'Raven, espresso & sleek' },
    { id: 'redhead', emoji: '👩‍🦰', label: 'Redhead', description: 'Copper, auburn & ginger' },
    { id: 'curly', emoji: '👩‍🦱', label: 'Curly Hair', description: 'Natural waves & coils' },
    { id: 'silver-grey', emoji: '👩‍🦳', label: 'Silver/Grey', description: 'Chic platinum or silver' },
    { id: 'bearded', emoji: '🧔‍♀️', label: 'Bearded', description: 'Distinctive editorial look' },
    { id: 'buzzcut-short', emoji: '👩‍🦲', label: 'Buzzcut/Short', description: 'Pixie, cropped or bold cut' },
  ],
  men: [
    { id: 'brunette', emoji: '👨🏽', label: 'Brunette', description: 'Classic chestnut & dark brown' },
    { id: 'light-brunette', emoji: '👨🏼', label: 'Light Brunette', description: 'Sandy brown & sun-kissed' },
    { id: 'blonde', emoji: '👱‍♂️', label: 'Blonde', description: 'Golden, surfer or dirty blonde' },
    { id: 'dark-black', emoji: '👨🏻', label: 'Dark/Black Hair', description: 'Jet black & sharp fade' },
    { id: 'redhead', emoji: '👨‍🦰', label: 'Redhead', description: 'Auburn, ginger & copper' },
    { id: 'curly', emoji: '👨‍🦱', label: 'Curly Hair', description: 'Textured curls & volume' },
    { id: 'silver-grey', emoji: '👨‍🦳', label: 'Silver/Grey', description: 'Salt-and-pepper charm' },
    { id: 'bearded', emoji: '🧔', label: 'Bearded', description: 'Full beard or sharp stubble' },
    { id: 'buzzcut-short', emoji: '👨‍🦲', label: 'Buzzcut/Short', description: 'Clean buzz or military crop' },
  ],
};

/**
 * Vibe & aesthetic archetype presets per gender mode.
 */
export const VIBE_AESTHETIC_PRESETS: Record<AppearanceGenderMode, ReadonlyArray<AppearancePresetItem>> = {
  women: [
    { id: 'latina-dancer', emoji: '💃', label: 'Latina/Dancer', description: 'Magnetic rhythm & fiery aura' },
    { id: 'princess', emoji: '👸', label: 'Princess', description: 'Glamorous & regal charm' },
    { id: 'classy-boss', emoji: '👩‍💼', label: 'Classy/Boss', description: 'Polished, ambitious & sharp' },
    { id: 'girl-next-door', emoji: '🌸', label: 'Girl Next Door', description: 'Warm, effortless & sweet' },
    { id: 'fit-athletic', emoji: '🏃‍♀️', label: 'Fit/Athletic', description: 'Sporty, toned & high energy' },
    { id: 'boho-indie', emoji: '🌙', label: 'Boho/Indie', description: 'Free spirit & festival glow' },
    { id: 'flirty-sassy', emoji: '💋', label: 'Flirty/Sassy', description: 'Playful banter & bold spark' },
    { id: 'goth-alt', emoji: '🖤', label: 'Goth/Alt', description: 'Dark edgy style & mystery' },
    { id: 'beach-babe', emoji: '🏖️', label: 'Beach Babe', description: 'Sun-kissed coastal energy' },
    { id: 'surfer-chill', emoji: '🏄‍♀️', label: 'Surfer/Chill', description: 'Laid-back waves & sunsets' },
    { id: 'artist-alt', emoji: '👩‍🎨', label: 'Artist/Alt', description: 'Creative soul & gallery muse' },
    { id: 'biker-bad-boy', emoji: '🏍️', label: 'Biker/Bad Boy', description: 'Leather jacket & wild streak' },
  ],
  men: [
    { id: 'latina-dancer', emoji: '🕺', label: 'Latina/Dancer', description: 'Smooth dancer & warm energy' },
    { id: 'princess', emoji: '🤴', label: 'Princess', description: 'Regal, refined & spoilt charm' },
    { id: 'classy-boss', emoji: '👨‍💼', label: 'Classy/Boss', description: 'Tailored suit & executive drive' },
    { id: 'girl-next-door', emoji: '☀️', label: 'Girl Next Door', description: 'Approachable & easygoing' },
    { id: 'fit-athletic', emoji: '🏋️‍♂️', label: 'Fit/Athletic', description: 'Gym-built & athletic lifestyle' },
    { id: 'boho-indie', emoji: '🎸', label: 'Boho/Indie', description: 'Vinyl collector & indie wanderer' },
    { id: 'flirty-sassy', emoji: '😏', label: 'Flirty/Sassy', description: 'Quick wit & teasing smile' },
    { id: 'goth-alt', emoji: '🖤', label: 'Goth/Alt', description: 'Dark aesthetic & tattoos' },
    { id: 'beach-babe', emoji: '🌴', label: 'Beach Babe', description: 'Summer tan & island vibes' },
    { id: 'surfer-chill', emoji: '🏄‍♂️', label: 'Surfer/Chill', description: 'Calm ocean breeze & board' },
    { id: 'artist-alt', emoji: '👨‍🎨', label: 'Artist/Alt', description: 'Creative mind & studio vibe' },
    { id: 'biker-bad-boy', emoji: '🏍️', label: 'Biker/Bad Boy', description: 'Rebel energy & midnight rides' },
  ],
};

/**
 * Curated Personality & Vibe tags for Section 1.
 */
export const PERSONALITY_VIBE_TAGS: ReadonlyArray<string> = [
  'Adventurous',
  'Artist',
  'Sweet',
  'Wild Heart',
  'Intellectual',
  'Sophisticated',
  'Dancer',
  'Witty',
  'Passionate',
  'Radiant',
  'Polyglot',
  'Mysterious',
  'Unforgettable spark',
  'Sweet memory',
  'Summer fling',
  'First love',
  'Crazy',
];

/**
 * Height selector options (`cm` with imperial display) covering 145–210 cm.
 */
export const HEIGHT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = Array.from(
  { length: 66 },
  (_, idx) => {
    const cm = 145 + idx;
    const totalInches = Math.round(cm / 2.54);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return {
      value: `${cm} cm`,
      label: `${cm} cm (${feet}'${inches}")`,
    };
  },
);

/**
 * Default toggleable hookup location pills for Section 4.
 */
export const HOOKUP_LOCATION_PRESETS: ReadonlyArray<{ id: string; emoji: string; label: string }> = [
  { id: 'Bed', emoji: '🛏️', label: 'Bed' },
  { id: 'Beach', emoji: '🏖️', label: 'Beach' },
  { id: 'Car', emoji: '🚗', label: 'Car' },
  { id: 'BnB', emoji: '🏡', label: 'BnB' },
];

/**
 * Curated Positions & Intimate Tags for Section 4.
 */
export const INTIMATE_TAG_PRESETS: ReadonlyArray<string> = [
  'Missionary',
  'Cowgirl',
  'Reverse Cowgirl',
  'Doggy',
  'Standing',
  'Shower',
  'Car play',
  'Outdoor',
  'Tantric',
  'Sensual',
  'Oral',
  'Wild',
  'Deep Connection',
];
