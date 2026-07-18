export class CookieJar {
  private readonly cookies = new Map<string, string>();

  absorb(headers: Headers): void {
    const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : (headers.get('set-cookie') ? [headers.get('set-cookie')!] : []);
    for (const header of values) {
      const [pair] = header.split(';', 1);
      const index = pair.indexOf('=');
      if (index < 1) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header(): string | undefined {
    if (!this.cookies.size) return undefined;
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  has(name: string): boolean { return this.cookies.has(name); }
  clone(): CookieJar { const next = new CookieJar(); for (const [key, value] of this.cookies) next.cookies.set(key, value); return next; }
}
