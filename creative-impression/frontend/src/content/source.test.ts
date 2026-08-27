import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineContent } from './define';
import { field } from './field';
import { contentCacheTag, loadContent, previewContent } from './source';

const demo = defineContent('demo', {
  hero: {
    heading: field.text('Default heading', { max: 40 }),
  },
  theme: {
    brand: field.color('#FBB602'),
  },
});

const BASE = 'http://backend.test/api';

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

const stubFetch = (impl: (...args: FetchArgs) => Promise<Response>) => {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
};

/** Responds with a raw body, so corrupt payloads can be expressed literally. */
const responds = (body: string, init: ResponseInit = {}) =>
  stubFetch(async () => new Response(body, init));

const load = () => loadContent(demo, { baseUrl: BASE });

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadContent with the backend down', () => {
  it('renders defaults when the request fails outright', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(load()).resolves.toEqual(demo.defaults);
    expect(warn).toHaveBeenCalled();
  });

  it('renders defaults when the request times out', async () => {
    stubFetch(async () => {
      const timedOut = new Error('The operation was aborted due to timeout');
      timedOut.name = 'TimeoutError';
      throw timedOut;
    });

    await expect(load()).resolves.toEqual(demo.defaults);
  });

  it('renders defaults when the backend errors', async () => {
    responds('<html>502 Bad Gateway</html>', { status: 502 });

    await expect(load()).resolves.toEqual(demo.defaults);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('502'));
  });

  // Nothing published yet is the state every namespace starts in, so it must
  // resolve quietly rather than looking like a fault in the log.
  it('treats 404 as nothing published, without warning', async () => {
    responds('', { status: 404 });

    await expect(load()).resolves.toEqual(demo.defaults);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('loadContent with a corrupt payload', () => {
  it.each([
    ['truncated JSON', '[{"path":"/hero/heading","value":'],
    ['an object where an array belongs', '{"success":true}'],
    ['an empty body', ''],
    ['HTML from a proxy', '<!doctype html><title>Login</title>'],
    ['an envelope wrapping junk', '{"success":true,"data":"oops"}'],
  ])('renders defaults for %s', async (_label, body) => {
    responds(body);

    await expect(load()).resolves.toEqual(demo.defaults);
  });

  // Junk mixed into an otherwise good publish costs those entries, not the page.
  it('keeps the readable entries and drops the rest', async () => {
    responds('[{"value":"no path here"},{"path":"/hero/heading","value":"Published"}]');

    const content = await load();
    expect(content.hero.heading).toBe('Published');
  });
});

describe('loadContent with a valid payload', () => {
  it('applies published values over defaults', async () => {
    responds('[{"path":"/hero/heading","value":"Published heading"}]');

    const content = await load();
    expect(content.hero.heading).toBe('Published heading');
    expect(content.theme.brand).toBe('#FBB602');
  });

  it('accepts the backend success envelope', async () => {
    responds('{"success":true,"data":[{"path":"/theme/brand","value":"#123456"}]}');

    const content = await load();
    expect(content.theme.brand).toBe('#123456');
  });

  // The shape the public endpoint actually returns. Asserting on the real
  // envelope is the point: the loader read one level too shallow, so every
  // storefront read quietly fell back to defaults while looking healthy.
  it('accepts the public endpoint envelope, which nests values one deeper', async () => {
    responds(
      '{"success":true,"message":"Content fetched","data":{"namespace":"demo","version":3,' +
        '"values":[{"path":"/theme/brand","value":"#123456"}]}}'
    );

    const content = await load();
    expect(content.theme.brand).toBe('#123456');
  });

  it('reports overrides the schema rejects and keeps their defaults', async () => {
    responds('[{"path":"/theme/brand","value":"cornflower"}]');
    const onReject = vi.fn();

    const content = await loadContent(demo, { baseUrl: BASE, onReject });
    expect(content.theme.brand).toBe('#FBB602');
    expect(onReject).toHaveBeenCalledWith('/theme/brand', expect.stringContaining('hex'));
  });

  it('logs rejected overrides when no reporter is supplied', async () => {
    responds('[{"path":"/theme/brand","value":"cornflower"}]');

    await load();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('demo#/theme/brand'));
  });

  // The reporter runs mid-resolve, so a broken one must not reach the render.
  it('survives a reporter that throws', async () => {
    responds('[{"path":"/theme/brand","value":"cornflower"}]');

    const content = await loadContent(demo, {
      baseUrl: BASE,
      onReject: () => {
        throw new Error('logger exploded');
      },
    });
    expect(content).toEqual(demo.defaults);
  });

  it('never mutates the compiled defaults', async () => {
    responds('[{"path":"/hero/heading","value":"Published heading"}]');

    await load();
    expect(demo.defaults.hero.heading).toBe('Default heading');
  });
});

describe('caching', () => {
  it('tags the read per namespace so a publish can revalidate it', async () => {
    const fetchMock = responds('[]');

    await load();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/content/demo`);
    expect(init?.cache).toBe('force-cache');
    expect(init?.next?.tags).toEqual([contentCacheTag('demo')]);
    expect(init?.next?.revalidate).toBe(3600);
  });

  it('can be pinned to the tag alone', async () => {
    const fetchMock = responds('[]');

    await loadContent(demo, { baseUrl: BASE, revalidate: false });

    expect(fetchMock.mock.calls[0][1]?.next?.revalidate).toBe(false);
  });
});

describe('previewContent', () => {
  it('lays a draft over the published values', async () => {
    responds('[{"path":"/hero/heading","value":"Published"}]');

    const content = await previewContent(demo, [{ path: '/hero/heading', value: 'Draft' }], {
      baseUrl: BASE,
    });
    expect(content.hero.heading).toBe('Draft');
  });

  it('parses a draft that arrived as JSON', async () => {
    responds('[]');

    const content = await previewContent(demo, '[{"path":"/hero/heading","value":"From cookie"}]', {
      baseUrl: BASE,
    });
    expect(content.hero.heading).toBe('From cookie');
  });

  it('previews the published site when the draft is corrupt', async () => {
    responds('[{"path":"/hero/heading","value":"Published"}]');

    const content = await previewContent(demo, '{ truncated', { baseUrl: BASE });
    expect(content.hero.heading).toBe('Published');
  });

  // An editor comparing draft against live must not be served a cached publish.
  it('bypasses the cache', async () => {
    const fetchMock = responds('[]');

    await previewContent(demo, null, { baseUrl: BASE });

    const init = fetchMock.mock.calls[0][1];
    expect(init?.cache).toBe('no-store');
    expect(init?.next).toBeUndefined();
  });
});
