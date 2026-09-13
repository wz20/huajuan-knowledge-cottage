import {it,expect} from 'vitest';
import {validate} from '../src/main/validation';
import {PROFILE_LINKS} from '../src/shared/profile-links';
it('allows only the two chosen destinations',()=>{for(const destination of ['github','douyin'])expect(validate('profile.open',{destination}).destination).toBe(destination);for(const destination of ['https://example.com','__proto__','constructor','file:///tmp/a',null])expect(()=>validate('profile.open',{destination})).toThrow();expect(PROFILE_LINKS.github).toBe('https://github.com/wz20');expect(decodeURIComponent(PROFILE_LINKS.douyin)).toBe('https://www.douyin.com/search/花卷AI实验室');});
