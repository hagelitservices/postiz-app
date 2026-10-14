import {
  AuthTokenDetails,
  PendingCheckResponse,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import dayjs from 'dayjs';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import {
  BadBody,
  Disconnect,
  RefreshToken,
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { TikTokDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';
import { timer } from '@gitroom/helpers/utils/timer';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { createReadStream } from 'fs';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { Integration } from '@prisma/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

@Rules(
  [
    'TikTok can have one video or one picture or multiple pictures, it cannot be without an attachment.',
    'TikTok posts are always published directly: content_posting_method must be DIRECT_POST. UPLOAD (send to the TikTok inbox as a draft) is not available on this instance and is rejected.',
    'video_made_with_ai, duet and stitch apply to video posts only. TikTok has no equivalent field for photo posts, so those settings are discarded when the attachment is a picture.',
  ].join(' ')
)
export class TiktokProvider extends SocialAbstract implements SocialProvider {
  identifier = 'tiktok';
  name = 'Tiktok';
  isBetweenSteps = false;
  convertToJPEG = true;
  // Kaido (TikTok app review): only the two scopes Direct Post needs. The
  // username comes from creator_info (video.publish) instead of
  // user.info.profile; analytics, the video list and the inbox upload, which
  // needed user.info.stats, video.list and video.upload, are switched off.
  scopes = ['user.info.basic', 'video.publish'];
  override maxConcurrentJob = 10000;
  dto = TikTokDto;
  editor = 'normal' as const;
  maxLength() {
    return 2000;
  }

  override async checkValidity(
    items: Array<ValidityMedia[]>
  ): Promise<string | true> {
    const [firstItems] = items ?? [];
    if ((firstItems?.length ?? 0) === 0) {
      return 'No video / images selected';
    }
    if (
      (firstItems?.length ?? 0) > 1 &&
      firstItems?.some((p) => (p?.path?.indexOf?.('mp4') ?? -1) > -1)
    ) {
      return 'Only pictures are supported when selecting multiple items';
    } else if (
      firstItems?.length !== 1 &&
      (firstItems?.[0]?.path?.indexOf?.('mp4') ?? -1) > -1
    ) {
      return 'You need one media';
    }

    // TikTok fails the whole photo post when a single image is oversized, and
    // the status only says `picture_size_check_failed` without naming it.
    if (firstItems?.every((p) => (p?.path?.indexOf?.('mp4') ?? -1) === -1)) {
      const dimensions = await Promise.all(
        firstItems?.map((p) => this.getImageDimensions(p?.path)) ?? []
      );
      const tooBig = dimensions.findIndex(
        (p) => Math.min(p?.width ?? 0, p?.height ?? 0) > 1080
      );
      if (tooBig > -1) {
        return `Image ${tooBig + 1} is ${dimensions[tooBig]?.width}x${
          dimensions[tooBig]?.height
        }, TikTok allows a maximum of 1080px on the shorter side`;
      }
    }
    return true;
  }

  override handleErrors(body: string):
    | {
        type: 'refresh-token' | 'bad-body' | 'disconnect';
        value: string;
      }
    | undefined {
    // Authentication/Authorization errors - require re-authentication
    if (body.indexOf('access_token_invalid') > -1) {
      return {
        type: 'refresh-token' as const,
        value:
          'Access token invalid, please re-authenticate your TikTok account',
      };
    }

    if (body.indexOf('scope_not_authorized') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Missing required permissions, please re-authenticate with all scopes',
      };
    }

    if (body.indexOf('scope_permission_missed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Additional permissions required, please re-authenticate',
      };
    }

    // Rate limiting errors
    if (body.indexOf('rate_limit_exceeded') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok API rate limit exceeded, please try again later',
      };
    }

    if (body.indexOf('file_format_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'File format is invalid, please check video specifications',
      };
    }

    if (body.indexOf('app_version_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'In order to use the TikTok upload feature, you have to update your app to the latest version',
      };
    }

    if (body.indexOf('duration_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Video duration is invalid, please check video specifications',
      };
    }

    if (body.indexOf('frame_rate_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Video frame rate is invalid, please check video specifications',
      };
    }

    if (body.indexOf('video_pull_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Failed to pull video from URL, please check the URL',
      };
    }

    if (body.indexOf('photo_pull_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Failed to pull photo from URL, please check the URL',
      };
    }

    if (body.indexOf('spam_risk_user_banned_from_posting') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Account banned from posting, please check TikTok account status',
      };
    }

    if (body.indexOf('spam_risk_text') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok detected potential spam in the post text',
      };
    }

    if (body.indexOf('spam_risk_too_many_posts') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'TikTok says your daily post limit reached, please try again tomorrow',
      };
    }

    if (body.indexOf('spam_risk_too_many_pending_share') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'TikTok limits pending posts to 5 within any 24-hour period. Please check your TikTok inbox in the TikTok mobile app and try again after 24 hours.',
      };
    }

    if (body.indexOf('spam_risk_user_banned_from_posting') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Account banned from posting, please check TikTok account status',
      };
    }

    if (body.indexOf('spam_risk') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok detected potential spam',
      };
    }

    // TikTok limits how many users of this app can post per day: refreshing
    // the token cannot help, the channel must be re-connected (and can be
    // migrated to another app via MIGRATE_PROVIDERS).
    if (body.indexOf('reached_active_user_cap') > -1) {
      return {
        type: 'disconnect' as const,
        value:
          'TikTok daily user limit reached, please re-connect your account',
      };
    }

    if (
      body.indexOf('unaudited_client_can_only_post_to_private_accounts') > -1
    ) {
      return {
        type: 'bad-body' as const,
        value: 'App not approved for public posting, contact support',
      };
    }

    if (body.indexOf('url_ownership_unverified') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'You have to upload the picture/video to Postiz when sending a URL',
      };
    }

    if (body.indexOf('privacy_level_option_mismatch') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Privacy level mismatch, please check privacy settings',
      };
    }

    // Content/Format validation errors
    if (body.indexOf('invalid_file_upload') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Invalid file format or specifications not met',
      };
    }

    if (body.indexOf('invalid_params') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'Invalid request parameters, please check content format',
      };
    }

    // Server errors
    if (body.indexOf('internal') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'There is a problem with TikTok servers, please try again later',
      };
    }

    // Generic TikTok API errors
    if (body.indexOf('picture_size_check_failed') > -1) {
      return {
        type: 'bad-body' as const,
        value:
          'Media size not supported by TikTok: images up to 1080px on the shorter side, videos at least 360px on both sides',
      };
    }

    if (body.indexOf('TikTok API error') > -1) {
      return {
        type: 'bad-body' as const,
        value: 'TikTok API error, please try again',
      };
    }

    // Fall back to parent class error handling
    return undefined;
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const value = {
      client_key: process.env.TIKTOK_CLIENT_ID!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    };

    const { access_token, refresh_token, ...all } = await (
      await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        body: new URLSearchParams(value).toString(),
      })
    ).json();

    const { avatar_url, display_name, open_id, username } =
      await this.userInfo(access_token);

    return {
      refreshToken: refresh_token,
      expiresIn: dayjs().add(23, 'hours').unix() - dayjs().unix(),
      accessToken: access_token,
      id: open_id.replace(/-/g, ''),
      name: display_name,
      picture: avatar_url || '',
      username: username,
    };
  }

  async generateAuthUrl() {
    const state = makeSecureId(16);

    return {
      url:
        'https://www.tiktok.com/v2/auth/authorize/' +
        `?client_key=${process.env.TIKTOK_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(
          `${
            process?.env?.FRONTEND_URL?.indexOf('https') === -1
              ? 'https://redirectmeto.com/'
              : ''
          }${process?.env?.FRONTEND_URL}/integrations/social/tiktok`
        )}` +
        `&state=${state}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(this.scopes.join(','))}`,
      codeVerifier: state,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const value = {
      client_key: process.env.TIKTOK_CLIENT_ID!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code: params.code,
      grant_type: 'authorization_code',
      code_verifier: params.codeVerifier,
      redirect_uri: `${
        process?.env?.FRONTEND_URL?.indexOf('https') === -1
          ? 'https://redirectmeto.com/'
          : ''
      }${process?.env?.FRONTEND_URL}/integrations/social/tiktok`,
    };

    const { access_token, refresh_token, scope } = await (
      await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        body: new URLSearchParams(value).toString(),
      })
    ).json();

    this.checkScopes(this.scopes, scope);

    const { avatar_url, display_name, open_id, username } =
      await this.userInfo(access_token);

    return {
      id: open_id.replace(/-/g, ''),
      name: display_name,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: dayjs().add(23, 'hours').unix() - dayjs().unix(),
      picture: avatar_url,
      username: username,
    };
  }

  // user.info.basic has no username; creator_info (video.publish) does. Without
  // it the profile URL falls back to the display name like before.
  private async userInfo(accessToken: string) {
    const {
      data: {
        user: { avatar_url, display_name, open_id },
      },
    } = await (
      await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
    ).json();

    let username: string | undefined;
    try {
      const creator = await (
        await fetch(
          'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=UTF-8',
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )
      ).json();
      username = creator?.data?.creator_username || undefined;
    } catch (err) {
      username = undefined;
    }

    return {
      avatar_url,
      display_name,
      open_id,
      username: username || display_name,
    };
  }

  async maxVideoLength(accessToken: string) {
    const {
      data: { max_video_post_duration_sec },
    } = await (
      await fetch(
        'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )
    ).json();

    return {
      maxDurationSeconds: max_video_post_duration_sec,
    };
  }

  // Kaido (TikTok Content Sharing Guidelines 1a-1c, 2b, 2c): the composer loads
  // creator_info every time it opens and renders the nickname, the privacy
  // options, the disabled interactions and the duration limit from it. Goes
  // through this.fetch so an expired token triggers the refresh cycle in
  // IntegrationsController.functionIntegration. A creator who cannot post right
  // now comes back as canPost: false instead of an exception, so the composer
  // can stop the attempt and say why (guideline 1b).
  async creatorInfo(accessToken: string) {
    let body: any;
    try {
      body = await (
        await this.fetch(
          'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=UTF-8',
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )
      ).json();
    } catch (err) {
      if (err instanceof BadBody) {
        return { canPost: false, reason: err.message || 'creator_info failed' };
      }
      throw err;
    }

    const code = body?.error?.code;
    if (code && code !== 'ok') {
      return { canPost: false, reason: body?.error?.message || code };
    }

    const data = body?.data || {};
    return {
      canPost: true,
      nickname: data.creator_nickname as string,
      username: data.creator_username as string,
      avatar: data.creator_avatar_url as string,
      privacyLevelOptions: (data.privacy_level_options || []) as string[],
      commentDisabled: !!data.comment_disabled,
      duetDisabled: !!data.duet_disabled,
      stitchDisabled: !!data.stitch_disabled,
      maxVideoPostDurationSec: data.max_video_post_duration_sec as number,
    };
  }

  // Single status check for a publish_id, no loops and no timers: `post` returns
  // a `pending` PostResponse right after the upload, and the post workflow polls
  // this method with durable timers, so a stuck/retried check can never re-run
  // the publish and duplicate the post.
  override async checkPostStatus(
    accessToken: string,
    pendingData: { publishId: string },
    integration: Integration
  ): Promise<PendingCheckResponse> {
    let post: any;
    let publicPostId: string | undefined;
    try {
      const raw = await (
        await this.fetch(
          'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=UTF-8',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              publish_id: pendingData.publishId,
            }),
          },
          '',
          0,
          true
        )
      ).text();
      ({ post, publicPostId } = this.parsePublishStatus(raw));
    } catch (err) {
      if (err instanceof RefreshToken || err instanceof Disconnect) {
        throw err;
      }

      // Transient API error while checking the status: the post may already
      // be live, so keep polling instead of failing it - if the API stays
      // broken the caller exhausts its checks and warns the user properly.
      return { status: 'pending', pendingData };
    }

    const { status } = post?.data || {};

    if (status === 'SEND_TO_USER_INBOX') {
      // the id stays 'missing' until the user publishes the draft - the
      // publish id rides in the URL fragment so resolveReleaseId can ask later
      return {
        status: 'completed',
        releaseURL: `https://www.tiktok.com/messages?lang=en#${pendingData.publishId}`,
        postId: 'missing',
      };
    }

    if (status === 'PUBLISH_COMPLETE') {
      // the id only shows up once moderation approves the post - fall back to
      // the profile URL and keep the publish_id (resolveReleaseId fixes it later)
      return {
        status: 'completed',
        releaseURL: !publicPostId
          ? `https://www.tiktok.com/@${integration.profile}`
          : this.postUrl(integration, pendingData.publishId, publicPostId),
        postId: !publicPostId ? pendingData.publishId : publicPostId,
      };
    }

    if (status === 'FAILED') {
      const handleError = this.handleErrors(JSON.stringify(post));
      throw new BadBody(
        'titok-error-upload',
        JSON.stringify(post),
        Buffer.from(JSON.stringify(post)),
        handleError?.value || ''
      );
    }

    return { status: 'pending', pendingData };
  }

  // photo posts (p_pub_... / p_inbox_...) live under /photo/, TikTok rejects
  // /video/ for them
  private postUrl(integration: Integration, publishId: string, postId: string) {
    return `https://www.tiktok.com/@${integration.profile}/${
      publishId.indexOf('p_') === 0 ? 'photo' : 'video'
    }/${postId}`;
  }

  // TikTok returns publicaly_available_post_id as an int64, which JSON.parse
  // rounds past 2^53 - pull the digits out of the raw body before parsing.
  private parsePublishStatus(raw: string) {
    const [, publicPostId] =
      raw.match(/"publicaly_available_post_id"\s*:\s*\[\s*"?(\d+)/) || [];

    return { post: JSON.parse(raw), publicPostId };
  }

  // Kaido (TikTok app review): Direct Post only. UPLOAD would need the
  // video.upload scope this app does not request, and silently publishing a
  // post that was meant as an inbox draft would be wrong - so it is rejected.
  private contentPostingMethod(
    firstPost: PostDetails<TikTokDto>
  ): 'DIRECT_POST' {
    if (firstPost?.settings?.content_posting_method === 'UPLOAD') {
      throw new BadBody(
        'tiktok',
        '{}',
        '{}',
        'TikTok UPLOAD (send to inbox) is not available: use DIRECT_POST'
      );
    }
    return 'DIRECT_POST';
  }

  private postingMethod(isPhoto: boolean): string {
    return isPhoto ? '/content/init/' : '/video/init/';
  }

  // Kaido (TikTok Content Sharing Guideline 2b): the visibility is always the
  // user's explicit choice. Upstream fell back to PUBLIC_TO_EVERYONE when it
  // was missing, which would publish a post publicly nobody chose to make
  // public. A missing value is a hard, non-retryable error instead.
  private requirePrivacyLevel(firstPost: PostDetails<TikTokDto>) {
    const level = firstPost.settings?.privacy_level;
    if (!level) {
      throw new BadBody(
        'tiktok',
        '{}',
        '{}',
        'TikTok privacy_level is missing: choose who can see this post before publishing'
      );
    }
    return level;
  }

  private buildTikokPostInfoBody(firstPost: PostDetails<TikTokDto>) {
    const isPhoto = !hasExtension(firstPost?.media?.[0]?.path, 'mp4');
    this.contentPostingMethod(firstPost);

  return {
      post_info: {
        ...(isPhoto && firstPost.settings.title
          ? { title: firstPost.settings.title.slice(0, 90) }
          : {}),
        ...(!isPhoto && firstPost.message
          ? { title: firstPost.message }
          : {}),
        ...(isPhoto ? { description: firstPost.message } : {}),
        privacy_level: this.requirePrivacyLevel(firstPost),
        ...(isPhoto
          ? {}
          : { disable_duet: !this.assetBoolean(firstPost.settings.duet) }),
        disable_comment: !this.assetBoolean(firstPost.settings.comment),
        ...(isPhoto
          ? {}
          : {
              disable_stitch: !this.assetBoolean(firstPost.settings.stitch),
            }),
        ...(isPhoto
          ? {}
          : {
              is_aigc: this.assetBoolean(
                firstPost.settings.video_made_with_ai
              ),
            }),
        brand_content_toggle: this.assetBoolean(
          firstPost.settings.brand_content_toggle
        ),
        brand_organic_toggle: this.assetBoolean(
          firstPost.settings.brand_organic_toggle
        ),
        ...(isPhoto
          ? {
              auto_add_music: firstPost.settings.autoAddMusic === 'yes',
            }
          : {}),
        ...(!isPhoto && firstPost?.media?.[0]?.thumbnailTimestamp != null
          ? {
              video_cover_timestamp_ms:
                firstPost?.media?.[0]?.thumbnailTimestamp,
            }
          : {}),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // OLD PULL_FROM_URL IMPLEMENTATION (kept for when the TikTok PULL bug is fixed)
  // ---------------------------------------------------------------------------
  // private buildTikokSourceInfoBody(firstPost: PostDetails<TikTokDto>) {
  //   const isPhoto = !hasExtension(firstPost?.media?.[0]?.path, 'mp4');
  //
  //   if (isPhoto) {
  //     return {
  //       post_mode:
  //         firstPost?.settings?.content_posting_method === 'DIRECT_POST'
  //           ? 'DIRECT_POST'
  //           : 'MEDIA_UPLOAD',
  //       media_type: 'PHOTO',
  //       source_info: {
  //         source: 'PULL_FROM_URL',
  //         photo_cover_index: 0,
  //         photo_images: firstPost.media?.map((p) => p.path),
  //       },
  //     };
  //   }
  //
  //   return {
  //     source_info: {
  //       source: 'PULL_FROM_URL',
  //       video_url: firstPost?.media?.[0]?.path!,
  //       ...(firstPost?.media?.[0]?.thumbnailTimestamp!
  //         ? {
  //             video_cover_timestamp_ms:
  //               firstPost?.media?.[0]?.thumbnailTimestamp!,
  //           }
  //         : {}),
  //     },
  //   };
  // }
  //
  // async post(
  //   id: string,
  //   accessToken: string,
  //   postDetails: PostDetails<TikTokDto>[],
  //   integration: Integration
  // ): Promise<PostResponse[]> {
  //   const [firstPost] = postDetails;
  //   const isPhoto = !hasExtension(firstPost?.media?.[0]?.path, 'mp4');
  //
  //   console.log({
  //     ...this.buildTikokPostInfoBody(firstPost),
  //     ...this.buildTikokSourceInfoBody(firstPost),
  //   });
  //   const {
  //     data: { publish_id },
  //   } = await (
  //     await this.fetch(
  //       `https://open.tiktokapis.com/v2/post/publish${this.postingMethod(
  //         firstPost.settings.content_posting_method,
  //         !hasExtension(firstPost?.media?.[0]?.path, 'mp4')
  //       )}`,
  //       {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json; charset=UTF-8',
  //           Authorization: `Bearer ${accessToken}`,
  //         },
  //         body: JSON.stringify({
  //           ...this.buildTikokPostInfoBody(firstPost),
  //           ...this.buildTikokSourceInfoBody(firstPost),
  //         }),
  //       }
  //     )
  //   ).json();
  //
  //   const { url, id: videoId } = await this.uploadedVideoSuccess(
  //     integration.profile!,
  //     publish_id,
  //     accessToken
  //   );
  //
  //   return [
  //     {
  //       id: firstPost.id,
  //       releaseURL: url,
  //       postId: String(videoId),
  //       status: 'success',
  //     },
  //   ];
  // }

  // ---------------------------------------------------------------------------
  // NEW FILE_UPLOAD IMPLEMENTATION (no PULL_FROM_URL for videos)
  // ---------------------------------------------------------------------------
  // TikTok video chunk constraints: a chunk must be between 5MB and 64MB.
  // When the whole file fits in a single chunk (<= 64MB) we upload it in one
  // request; otherwise we split it into 10MB chunks (the final chunk carries
  // the remainder, which TikTok allows to exceed chunk_size).
  private static readonly TIKTOK_MAX_SINGLE_CHUNK = 64 * 1024 * 1024;
  private static readonly TIKTOK_CHUNK_SIZE = 10 * 1024 * 1024;

  private tiktokChunkPlan(videoSize: number) {
    if (videoSize <= TiktokProvider.TIKTOK_MAX_SINGLE_CHUNK) {
      return { chunkSize: videoSize, totalChunkCount: 1 };
    }

    const chunkSize = TiktokProvider.TIKTOK_CHUNK_SIZE;
    return {
      chunkSize,
      totalChunkCount: Math.floor(videoSize / chunkSize),
    };
  }

  // Returns a streaming body for the [start, end] byte range of the media so we
  // never hold the whole file in memory: a ranged GET for remote URLs, a ranged
  // read stream for local files.
  private async tiktokChunkStream(path: string, start: number, end: number) {
    if (path.indexOf('http') === 0) {
      // identity encoding so the store keeps content-length and can answer
      // with the requested range, matching every other media read
      const response = await fetch(path, {
        headers: {
          Range: `bytes=${start}-${end}`,
          'accept-encoding': 'identity',
        },
        dispatcher: getSsrfSafeDispatcher(),
      } as any);

      // A store that ignores Range (200 with the full file) or answers with an
      // error page would corrupt the upload at this offset.
      if (response.status !== 206) {
        throw new BadBody(
          'tiktok-error-upload',
          '{}',
          '{}',
          'The media storage did not return the requested byte range, please try again'
        );
      }

      return response.body;
    }

    return createReadStream(path, { start, end });
  }

  // Streams the video bytes to the upload_url returned by the init call.
  // We use the global fetch (not this.fetch) because chunked uploads answer
  // with 206 (Partial Content), which this.fetch would treat as an error.
  private async uploadTikTokVideoBytes(
    uploadUrl: string,
    path: string,
    videoSize: number,
    contentType: string
  ) {
    const { chunkSize, totalChunkCount } = this.tiktokChunkPlan(videoSize);

    for (let i = 0; i < totalChunkCount; i++) {
      const start = i * chunkSize;
      const end =
        i === totalChunkCount - 1 ? videoSize - 1 : start + chunkSize - 1;
      const contentLength = end - start + 1;

      const body = await this.tiktokChunkStream(path, start, end);

      const upload = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(contentLength),
          'Content-Range': `bytes ${start}-${end}/${videoSize}`,
        },
        body,
        // Required by undici when streaming a request body.
        duplex: 'half',
      } as any);

      if (
        upload.status !== 200 &&
        upload.status !== 201 &&
        upload.status !== 206
      ) {
        const text = await upload.text().catch(() => '{}');
        const handleError = this.handleErrors(text);
        throw new BadBody(
          'tiktok-error-upload',
          text,
          Buffer.from(text),
          handleError?.value || 'Failed to upload the video to TikTok'
        );
      }
    }
  }

  // Kaido (TikTok Content Sharing Guidelines, Technical Considerations 2):
  // "If video resources are already on API Clients' servers, do not use
  // FILE_UPLOAD; use PULL_FROM_URL instead." and "The supplied URL must be
  // under the path of a domain or URL prefix API Clients have ownership on."
  // Media of local storage is served under every address of this instance
  // (older rows still carry a previous host), so it is moved to FRONTEND_URL.
  // TIKTOK_PULL_URL_PREFIX names the prefix verified in the TikTok app; a URL
  // outside of it falls back to FILE_UPLOAD like upstream.
  private tiktokMediaUrl(path: string) {
    if (
      path?.indexOf('http') !== 0 ||
      process.env.STORAGE_PROVIDER !== 'local' ||
      !process.env.FRONTEND_URL
    ) {
      return path;
    }
    const url = new URL(path);
    const uploads = `${process.env.NEXT_PUBLIC_UPLOAD_DIRECTORY || '/uploads'}/`;
    if (url.pathname.indexOf(uploads) !== 0) {
      return path;
    }
    return new URL(url.pathname, process.env.FRONTEND_URL).toString();
  }

  private tiktokPullUrl(path: string) {
    const prefix = process.env.TIKTOK_PULL_URL_PREFIX;
    const url = this.tiktokMediaUrl(path);
    return prefix && url?.indexOf(prefix) === 0 ? url : undefined;
  }

  private buildTikokSourceInfoBody(
    firstPost: PostDetails<TikTokDto>,
    videoSize?: number
  ) {
    const isPhoto = !hasExtension(firstPost?.media?.[0]?.path, 'mp4');

    // TikTok photo posts only support PULL_FROM_URL, there is no FILE_UPLOAD
    // path for photos, so this branch keeps pulling from the URL.
    if (isPhoto) {
      return {
        post_mode: this.contentPostingMethod(firstPost),
        media_type: 'PHOTO',
        source_info: {
          source: 'PULL_FROM_URL',
          photo_cover_index: 0,
          photo_images: firstPost.media?.map((p) =>
            this.tiktokMediaUrl(p.path)
          ),
        },
      };
    }

    const videoUrl = this.tiktokPullUrl(firstPost?.media?.[0]?.path!);
    if (videoUrl) {
      return {
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: videoUrl,
          ...(firstPost?.media?.[0]?.thumbnailTimestamp!
            ? {
                video_cover_timestamp_ms:
                  firstPost?.media?.[0]?.thumbnailTimestamp!,
              }
            : {}),
        },
      };
    }

    const { chunkSize, totalChunkCount } = this.tiktokChunkPlan(videoSize || 0);

    return {
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    };
  }

  private rejectPost(reason: string): never {
    throw new BadBody('tiktok', '{}', '{}', reason);
  }

  // Kaido (TikTok Content Sharing Guidelines 1b, 1c, 3a, 3b): the same rules
  // the composer enforces, checked again right before anything is sent to
  // TikTok - for posts scheduled long ago and for the Public API alike.
  private async checkBeforePublish(
    accessToken: string,
    firstPost: PostDetails<TikTokDto>,
    isPhoto: boolean,
    videoPath: string,
    videoSize?: number
  ) {
    const settings: any = firstPost?.settings || {};
    if (
      settings.disclose === true &&
      !this.assetBoolean(settings.brand_organic_toggle) &&
      !this.assetBoolean(settings.brand_content_toggle)
    ) {
      this.rejectPost(
        'You need to indicate if your content promotes yourself, a third party, or both.'
      );
    }
    if (
      this.assetBoolean(settings.brand_content_toggle) &&
      settings.privacy_level === 'SELF_ONLY'
    ) {
      this.rejectPost('Branded content visibility cannot be set to private.');
    }

    const creator: any = await this.creatorInfo(accessToken);
    if (!creator?.canPost) {
      this.rejectPost(
        `This TikTok account cannot post right now${
          creator?.reason ? ` (${creator.reason})` : ''
        }. Please try again later.`
      );
    }
    const options: string[] = creator.privacyLevelOptions || [];
    if (
      options.length &&
      settings.privacy_level &&
      !options.includes(settings.privacy_level)
    ) {
      this.rejectPost(
        `This TikTok account does not offer the visibility ${settings.privacy_level} (available: ${options.join(', ')})`
      );
    }

    const max = Number(creator.maxVideoPostDurationSec) || 0;
    if (!isPhoto && max && videoSize) {
      const duration = await this.videoDurationSec(videoPath, videoSize);
      if (duration !== undefined && duration > max) {
        this.rejectPost(
          `This video is ${Math.ceil(duration)}s long. This TikTok account can post videos up to ${max}s.`
        );
      }
    }
  }

  private async readMediaRange(path: string, start: number, end: number) {
    const stream: any = await this.tiktokChunkStream(path, start, end);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // Reads the duration from the MP4 movie header (moov/mvhd) with a few small
  // ranged reads, walking the top-level boxes - no ffmpeg, no full download.
  // undefined when the file can't be read or parsed: TikTok still rejects an
  // overlong video itself (duration_check_failed).
  async videoDurationSec(
    path: string,
    size: number
  ): Promise<number | undefined> {
    try {
      let offset = 0;
      for (let i = 0; i < 64 && offset + 8 <= size; i++) {
        const head = await this.readMediaRange(
          path,
          offset,
          Math.min(offset + 15, size - 1)
        );
        let boxSize = head.readUInt32BE(0);
        const type = head.toString('latin1', 4, 8);
        let headerSize = 8;
        if (boxSize === 1) {
          boxSize = Number(head.readBigUInt64BE(8));
          headerSize = 16;
        } else if (boxSize === 0) {
          boxSize = size - offset;
        }
        if (boxSize < headerSize) {
          return undefined;
        }
        if (type === 'moov') {
          const body = await this.readMediaRange(
            path,
            offset + headerSize,
            Math.min(offset + boxSize - 1, offset + headerSize + 4095)
          );
          const at = body.indexOf('mvhd', 0, 'latin1');
          if (at < 4) {
            return undefined;
          }
          const p = at + 4;
          const v1 = body[p] === 1;
          const timescale = body.readUInt32BE(p + (v1 ? 20 : 12));
          const duration = v1
            ? Number(body.readBigUInt64BE(p + 24))
            : body.readUInt32BE(p + 16);
          return timescale ? duration / timescale : undefined;
        }
        offset += boxSize;
      }
    } catch (err) {
      return undefined;
    }
    return undefined;
  }

  async postPending(
    id: string,
    accessToken: string,
    postDetails: PostDetails<TikTokDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const isPhoto = !hasExtension(firstPost?.media?.[0]?.path, 'mp4');
    const videoPath = firstPost?.media?.[0]?.path!;

    // For videos we only need the total size up front (HEAD / statSync) so we
    // can init the upload; the bytes themselves are streamed later, never fully
    // loaded into memory.
    const videoSize = isPhoto
      ? undefined
      : await this.mediaSize(videoPath, 'tiktok-error-upload');

    await this.checkBeforePublish(
      accessToken,
      firstPost,
      isPhoto,
      videoPath,
      videoSize
    );

    const {
      data: { publish_id, upload_url },
    } = await (
      await this.fetch(
        `https://open.tiktokapis.com/v2/post/publish${this.postingMethod(isPhoto)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            ...this.buildTikokPostInfoBody(firstPost),
            ...this.buildTikokSourceInfoBody(firstPost, videoSize),
          }),
        }
      )
    ).json();

    // Videos sent as FILE_UPLOAD: stream the bytes to the upload_url returned
    // by the init call (PULL_FROM_URL returns none, TikTok fetches the file).
    if (!isPhoto && upload_url && videoSize) {
      try {
        await this.uploadTikTokVideoBytes(
          upload_url,
          videoPath,
          videoSize,
          'video/mp4'
        );
      } catch (err) {
        // An explicit rejection from TikTok: the post won't publish, fail it
        if (err instanceof BadBody) {
          throw err;
        }

        // A network error here is ambiguous - TikTok may have received all
        // the bytes and still publish. Return pending and let checkPostStatus
        // deliver TikTok's own verdict instead of letting the caller retry
        // the publish.
      }
    }

    // The publish is now irreversible on TikTok's side: return `pending` so the
    // workflow polls checkPostStatus instead of blocking (and possibly timing
    // out and re-posting) inside this activity.
    return [
      {
        id: firstPost.id,
        releaseURL: '',
        postId: '',
        status: 'pending',
        pendingData: { publishId: publish_id },
      },
    ];
  }

  // Old blocking behavior, kept for workflow versions before v1.0.6 that still
  // run (scheduled posts sleep inside them until publish time) and don't know
  // how to resolve a `pending` response - they keep polling inside the
  // activity exactly like before.
  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<TikTokDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [response] = await this.postPending(
      id,
      accessToken,
      postDetails,
      integration
    );

    const started = Date.now();

    for (const _ of Array(27).keys()) {
      // ~9 minutes at 20s interval
      const check = await this.checkPostStatus(
        accessToken,
        response.pendingData,
        integration
      );

      if (check.status === 'completed') {
        return [
          {
            id: response.id,
            releaseURL: check.releaseURL,
            postId: String(check.postId),
            status: 'success',
          },
        ];
      }

      // Cap below the 10-minute activity timeout of the old workflows using
      // this method: failing here (non-retryable) is safe, timing the activity
      // out is not - a retried activity would publish the post again.
      if (Date.now() - started > 8 * 60 * 1000) {
        break;
      }

      await timer(20000);
    }

    throw new BadBody(
      'titok-error-upload',
      JSON.stringify({}),
      Buffer.from(JSON.stringify({})),
      'TikTok refused to publish your post'
    );
  }

  // Kaido: analytics, postAnalytics, missing and releaseUrl are not
  // implemented - they need user.info.stats / video.list, which this app does
  // not request (see scopes). Postiz hides them for providers without them.

  // Posts published before moderation finished keep their publish_id
  // (v_pub_file~... / p_pub_url~...) as releaseId - resolve it to the post id
  async resolveReleaseId(
    accessToken: string,
    releaseId: string,
    integration: Integration,
    settings: any,
    releaseURL: string
  ) {
    // a draft sent to the inbox (UPLOAD) is stored as 'missing' with its
    // publish id in the URL fragment
    const draft = releaseId === 'missing';
    const publishId = draft ? releaseURL?.split('#')[1] || '' : releaseId;
    if (
      publishId.indexOf('_pub_') === -1 &&
      publishId.indexOf('_inbox_') === -1
    ) {
      return undefined;
    }

    // TikTok only gives a post id to posts published for public viewership
    // (a draft ignores the privacy setting, the user picks it in the app)
    if (
      !draft &&
      ['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS'].includes(settings?.privacy_level)
    ) {
      return { unavailable: true as const };
    }

    const { publicPostId } = this.parsePublishStatus(
      await (
        await this.fetch(
          'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=UTF-8',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              publish_id: publishId,
            }),
          }
        )
      ).text()
    );

    if (!publicPostId) {
      // a draft with no public post (not published yet, or published as
      // non-public) keeps opening the inbox instead of asking to retry
      return draft ? undefined : { pending: true as const };
    }

    return {
      postId: publicPostId,
      releaseURL: this.postUrl(integration, publishId, publicPostId),
    };
  }
}
