import { EventBus } from '../console/events.js'
import { TwitterClient } from '../twitter/client.js'

/**
 * Resolves sourceUrls into the best tweet ID to quote-tweet.
 *
 * Strategy (in priority order):
 * 1. Extract tweet IDs directly from any Twitter/X URLs in sourceUrls
 * 2. Verify those tweets still exist and pick the highest-engagement one
 * 3. If no Twitter URLs, fall back to searching for a popular tweet about the topic
 */
export class QuoteTweetResolver {
  constructor(
    private twitter: TwitterClient,
    private events: EventBus,
  ) {}

  /**
   * Given source URLs and a topic summary, resolve the best tweet to quote.
   * Returns a tweet ID or undefined if no suitable tweet is found.
   */
  async resolve(
    sourceUrls: string[] | undefined,
    topicSummary: string,
  ): Promise<string | undefined> {
    // 1. Try to extract tweet IDs from source URLs
    const tweetIds = extractTweetIds(sourceUrls ?? [])

    if (tweetIds.length > 0) {
      this.events.monologue(
        `Found ${tweetIds.length} source tweet(s). Checking which is best to quote...`,
      )

      // Verify tweets exist and pick the one with highest engagement
      const best = await this.pickBestTweet(tweetIds)
      if (best) {
        this.events.monologue(`Quoting source tweet ${best}.`)
        return best
      }
      this.events.monologue('Source tweets could not be verified. Falling back to search...')
    }

    // 2. Fall back to searching for a popular tweet about this topic
    try {
      const found = await this.twitter.findTweetAbout(topicSummary)
      if (found) {
        this.events.monologue(`Found popular tweet to quote via search: ${found}`)
        return found
      }
    } catch (err) {
      this.events.monologue(
        `Quote-tweet search failed: ${(err as Error).message}. Posting without quote.`,
      )
    }

    this.events.monologue('No suitable tweet to quote. Posting standalone.')
    return undefined
  }

  /**
   * Given multiple tweet IDs, verify they exist and return the one
   * with the highest engagement (likes + retweets).
   */
  private async pickBestTweet(tweetIds: string[]): Promise<string | undefined> {
    if (!this.twitter.provider) return tweetIds[0] // No read provider — just use the first one

    let bestId: string | undefined
    let bestScore = -1

    for (const id of tweetIds.slice(0, 5)) { // Cap at 5 to avoid rate limits
      try {
        const tweet = await this.twitter.provider.getTweetById(id)
        if (!tweet) continue

        const score = tweet.likeCount + tweet.retweetCount * 2
        if (score > bestScore) {
          bestScore = score
          bestId = id
        }
      } catch {
        // Tweet may have been deleted or be inaccessible — skip it
        continue
      }
    }

    return bestId
  }
}

// --- URL parsing helpers ---

/**
 * Regex patterns for Twitter/X URLs that contain tweet IDs.
 * Handles: twitter.com, x.com, mobile.twitter.com, vxtwitter.com, fxtwitter.com
 */
const TWEET_URL_PATTERN =
  /(?:https?:\/\/)?(?:(?:www\.|mobile\.)?(?:twitter|x|vxtwitter|fxtwitter)\.com)\/\w+\/status(?:es)?\/(\d+)/gi

/**
 * Extract tweet IDs from an array of URLs.
 * Deduplicates and returns unique IDs.
 */
export function extractTweetIds(urls: string[]): string[] {
  const ids = new Set<string>()

  for (const url of urls) {
    TWEET_URL_PATTERN.lastIndex = 0 // Reset regex state
    let match: RegExpExecArray | null
    while ((match = TWEET_URL_PATTERN.exec(url)) !== null) {
      ids.add(match[1])
    }
  }

  return [...ids]
}
