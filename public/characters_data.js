/**
 * DMI YOGA - Anime Character Roster for Duo 1v1 Fighting Mode
 * Featuring iconic anime champions with arcade fighting game portraits.
 */

const ANIME_CHARACTERS = [
  {
    id: 'goku',
    name: 'SON GOKU',
    subtitle: 'Kakarot - Saiyan God',
    anime: 'DRAGON BALL Z',
    title: 'SUPER SAIYAN',
    image: 'images/characters/goku.jpg',
    color: '#f59e0b',
    glowColor: 'rgba(245, 158, 11, 0.6)',
    quote: 'KAMEHAMEHA! Transcending beyond mortal limits!',
    stats: { power: 98, speed: 95, energy: 99 }
  },
  {
    id: 'naruto',
    name: 'NARUTO UZUMAKI',
    subtitle: 'Hero of the Hidden Leaf',
    anime: 'NARUTO SHIPPUDEN',
    title: 'NINE TAILS SAGE',
    image: 'images/characters/naruto.jpg',
    color: '#f97316',
    glowColor: 'rgba(249, 115, 22, 0.6)',
    quote: "Dattebayo! I will never yield, that's my ninja way!",
    stats: { power: 92, speed: 94, energy: 96 }
  },
  {
    id: 'luffy',
    name: 'MONKEY D. LUFFY',
    subtitle: 'Warrior of Liberation',
    anime: 'ONE PIECE',
    title: 'GEAR 5 NIKA',
    image: 'images/characters/luffy.jpg',
    color: '#ef4444',
    glowColor: 'rgba(239, 68, 68, 0.6)',
    quote: "Gomu Gomu no Gigant! I'm the one who will become King of the Pirates!",
    stats: { power: 96, speed: 90, energy: 95 }
  },
  {
    id: 'tanjiro',
    name: 'TANJIRO KAMADO',
    subtitle: 'Sun Breathing Swordsman',
    anime: 'DEMON SLAYER',
    title: 'WATER BREATHING',
    image: 'images/characters/tanjiro.jpg',
    color: '#06b6d4',
    glowColor: 'rgba(6, 182, 212, 0.6)',
    quote: 'Hinokami Kagura! Slicing through the endless darkness with flames!',
    stats: { power: 88, speed: 91, energy: 92 }
  },
  {
    id: 'gojo',
    name: 'SATORU GOJO',
    subtitle: 'The Limitless Prodigy',
    anime: 'JUJUTSU KAISEN',
    title: 'LIMITLESS VOID',
    image: 'images/characters/gojo.jpg',
    color: '#8b5cf6',
    glowColor: 'rgba(139, 92, 246, 0.6)',
    quote: 'Ryouiki Tenkai! Throughout heaven and earth, I alone am the honored one!',
    stats: { power: 100, speed: 99, energy: 100 }
  },
  {
    id: 'saitama',
    name: 'SAITAMA',
    subtitle: 'The One Punch Hero',
    anime: 'ONE PUNCH MAN',
    title: 'SERIOUS PUNCH',
    image: 'images/characters/saitama.jpg',
    color: '#eab308',
    glowColor: 'rgba(234, 179, 8, 0.6)',
    quote: 'Killer Move: Serious Punch! Just an ordinary hero for fun!',
    stats: { power: 100, speed: 98, energy: 90 }
  },
  {
    id: 'zoro',
    name: 'RORONOA ZORO',
    subtitle: 'King of Hell - Swordsman',
    anime: 'ONE PIECE',
    title: 'THREE SWORD STYLE',
    image: 'images/characters/zoro.jpg',
    color: '#22c55e',
    glowColor: 'rgba(34, 197, 94, 0.6)',
    quote: 'Santoryu Ougi: Ichidai Sanzen Daisen Sekai! Nothing happened!',
    stats: { power: 94, speed: 92, energy: 90 }
  },
  {
    id: 'nezuko',
    name: 'NEZUKO KAMADO',
    subtitle: 'Awakened Demon Maiden',
    anime: 'DEMON SLAYER',
    title: 'BLOOD DEMON ART',
    image: 'images/characters/nezuko.jpg',
    color: '#ec4899',
    glowColor: 'rgba(236, 72, 153, 0.6)',
    quote: 'Blood Demon Art: Exploding Blood! Incinerating the wicked!',
    stats: { power: 90, speed: 93, energy: 94 }
  },
  {
    id: 'deku',
    name: 'IZUKU MIDORIYA',
    subtitle: 'Deku - Ninth Successor',
    anime: 'MY HERO ACADEMIA',
    title: 'ONE FOR ALL 100%',
    image: 'images/characters/deku.jpg',
    color: '#10b981',
    glowColor: 'rgba(16, 185, 129, 0.6)',
    quote: 'One For All: Full Cowl 100%! Delaware Detroit SMASH!',
    stats: { power: 95, speed: 92, energy: 93 }
  },
  {
    id: 'sasuke',
    name: 'SASUKE UCHIHA',
    subtitle: 'Shadow of the Shinobi',
    anime: 'NARUTO SHIPPUDEN',
    title: 'RINNEGAN CHIDORI',
    image: 'images/characters/sasuke.jpg',
    color: '#6366f1',
    glowColor: 'rgba(99, 102, 241, 0.6)',
    quote: 'Rinnegan & Chidori! In my realm, destiny has already been decided!',
    stats: { power: 94, speed: 96, energy: 95 }
  },
  {
    id: 'levi',
    name: 'LEVI ACKERMAN',
    subtitle: "Humanity's Strongest Soldier",
    anime: 'ATTACK ON TITAN',
    title: 'HUMANITY STRONGEST',
    image: 'images/characters/levi.jpg',
    color: '#14b8a6',
    glowColor: 'rgba(20, 184, 166, 0.6)',
    quote: 'Dedicate your hearts! Not a single titan survives my twin steel!',
    stats: { power: 96, speed: 100, energy: 88 }
  },
  {
    id: 'anya',
    name: 'ANYA FORGER',
    subtitle: 'Telepathic Starlight',
    anime: 'SPY x FAMILY',
    title: 'TELEPATH STAR',
    image: 'images/characters/anya.jpg',
    color: '#f43f5e',
    glowColor: 'rgba(244, 63, 94, 0.6)',
    quote: 'Heh! (Smirk) Waku Waku! Anya has foreseen every single movement!',
    stats: { power: 85, speed: 89, energy: 99 }
  }
];

if (typeof window !== 'undefined') {
  window.ANIME_CHARACTERS = ANIME_CHARACTERS;
}
