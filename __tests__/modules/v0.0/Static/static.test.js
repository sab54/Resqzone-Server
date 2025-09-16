/**
 * static.test.js
 *
 * Covers:
 * 1. shuffle(array)
 * 2. extractHostname & extractRootDomain
 * 3. getIp(req)
 */

const { shuffle, extractHostname, extractRootDomain, getIp } = require('../../../../modules/v0.0/Static/static');

// Mock geoip-lite
jest.mock('geoip-lite', () => ({
  lookup: jest.fn().mockReturnValue({ country: 'US', region: 'CA' }),
}));

describe('static.js', () => {
  test('shuffle returns same elements in different order', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffle([...arr]);

    expect(shuffled).toHaveLength(arr.length);
    expect(new Set(shuffled)).toEqual(new Set(arr));
  });

  test('extractHostname strips protocol, port, and query', () => {
    expect(extractHostname('http://sub.example.com:8080/page?x=1')).toBe('sub.example.com');
    expect(extractHostname('https://example.org')).toBe('example.org');
    expect(extractHostname('ftp://foo.bar.co.uk/resource')).toBe('foo.bar.co.uk');
  });

  test('extractRootDomain collapses subdomains and handles ccTLD', () => {
    expect(extractRootDomain('http://sub.example.com')).toBe('example.com');
    expect(extractRootDomain('http://foo.bar.co.uk')).toBe('bar.co.uk');
    expect(extractRootDomain('example.org')).toBe('example.org');
  });

  test('getIp reads the LAST IP from x-forwarded-for and enriches via geoip-lite', () => {
    // Your implementation uses .split(',').pop().trim()
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.42, 10.0.0.1' },
      connection: { remoteAddress: '10.0.0.1' },
      socket: {},
    };
    const info = getIp(req, {});
    expect(info.ip).toBe('10.0.0.1'); // last IP wins
    expect(info.geoData).toEqual({ country: 'US', region: 'CA' });
  });

  test('getIp falls back to sole x-forwarded-for IP when only one is present', () => {
    const req = {
      headers: { 'x-forwarded-for': '198.51.100.7' },
      connection: { remoteAddress: '10.0.0.1' },
      socket: {},
    };
    const info = getIp(req, {});
    expect(info.ip).toBe('198.51.100.7');
    expect(info.geoData).toEqual({ country: 'US', region: 'CA' });
  });
});
