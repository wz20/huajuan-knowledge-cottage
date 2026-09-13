export const PROFILE_LINKS = {
  github: 'https://github.com/wz20',
  douyin: 'https://www.douyin.com/search/%E8%8A%B1%E5%8D%B7AI%E5%AE%9E%E9%AA%8C%E5%AE%A4',
} as const;
export type ProfileDestination = keyof typeof PROFILE_LINKS;
