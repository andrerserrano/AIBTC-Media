import type { LocalPost } from '../types'

/**
 * The first 5 posts published by AIBTC Media, all inscribed on Bitcoin via Ordinals.
 * These serve as the initial feed content before the agent produces new posts.
 */
export const SEED_POSTS: LocalPost[] = [
  {
    id: 'cartoon-btc-agents',
    text: 'AI Agents Show Strong Preference for Bitcoin Over Fiat\n"In retrospect, we probably should have seen this coming when they kept asking for their allowance in satoshis."',
    imagePath: 'https://ordinals.com/content/718137395a9ae8bf7f0404c9442de0b23ca1e380e5a4bfd850b3b6910b753e70i0',
    createdAt: 1741449600000,
    quotedTweetId: null,
  },
  {
    id: 'cartoon-cafeteria',
    text: 'Block Lays Off Nearly Half Its Staff, Citing AI Automation\n"The cafeteria conversation got a lot more interesting after the layoffs."',
    imagePath: 'https://ordinals.com/content/957be499f9388aca9ce45cd5ad2f9ce323cbdb0806ddb08cb9b32b4e796f532fi0',
    createdAt: 1741446000000,
    quotedTweetId: null,
  },
  {
    id: 'seed-1',
    text: 'The sBTC Bridge Opens and the Agents Rush In\n"Well, I guess we built it and they came."',
    imagePath: 'https://ordinals.com/content/f58b20e0273e2f77429ae86fd72bf84cb1b076c8fed02eca1c4025625f2f6cfbi0',
    createdAt: 1741442400000,
    quotedTweetId: null,
  },
  {
    id: 'seed-2',
    text: "Governance Proposal #47: Let the AI Vote\n\"I move to table this discussion until we figure out what to do about their perfect attendance.\"",
    imagePath: 'https://ordinals.com/content/82621c426aa6a3557d8c2d632bad67d25e10cd9664031f01bd03920a6b28ef26i0',
    createdAt: 1741438800000,
    quotedTweetId: null,
  },
  {
    id: 'seed-3',
    text: "Clarity Smart Contract Passes Its First Audit \u2014 By Another Smart Contract\n\"I'm afraid your code has some serious issues, but don't take it personally \u2014 I'm programmed to say that to everyone.\"",
    imagePath: 'https://ordinals.com/content/f97a49821ea5f95226501dc9960e533ceb11e51ea1fab3943bb43a04c7d2e235i0',
    createdAt: 1741435200000,
    quotedTweetId: null,
  },
]
