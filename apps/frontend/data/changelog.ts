export interface Release {
  date: string;
  version: string;
  title: string;
  tag: 'New' | 'Improved' | 'Fixed';
  items: string[];
}

export const RELEASES: Release[] = [
  {
    date: 'October 1, 2026',
    version: '2.6',
    title: 'Game servers are here',
    tag: 'New',
    items: ['Minecraft, FiveM, Rust, Palworld and Valheim servers in Lyon.', 'One-click modpack installer for Forge, Fabric and NeoForge.', 'Always-on DDoS protection tuned for game protocols.'],
  },
  { date: 'September 12, 2026', version: '2.5', title: 'Paris region', tag: 'New', items: ['Deploy services to France — Paris.', 'Private networking between services in the same region.'] },
  { date: 'August 28, 2026', version: '2.4.2', title: 'Faster builds', tag: 'Improved', items: ['Dependency caching makes repeat builds up to 3x faster.', 'Build logs now stream with timestamps.'] },
  { date: 'July 30, 2026', version: '2.4', title: 'Node.js 22 LTS', tag: 'New', items: ['Node.js 22 LTS available on every plan.', 'Automatic detection of pnpm, yarn and Bun lockfiles.'] },
  { date: 'July 9, 2026', version: '2.3.1', title: 'Log viewer fixes', tag: 'Fixed', items: ['Fixed auto-scroll jumping when new lines arrive quickly.', 'Downloaded logs now include the log level.'] },
];
