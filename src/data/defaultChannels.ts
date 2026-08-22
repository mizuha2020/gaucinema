import { Channel } from '../types';

export const DEFAULT_CHANNELS: Channel[] = [
  // ⚽ THỂ THAO
  {
    name: 'VTC3 HD Thể Thao',
    logo: 'https://upload.wikimedia.org/wikipedia/vi/thumb/4/46/Logo_VTC3.svg/200px-Logo_VTC3.svg.png',
    group: '⚽ Thể Thao',
    url: 'https://live.vtc.gov.vn/vtc3/index.m3u8',
  },
  {
    name: 'HTV Thể Thao HD',
    logo: 'https://upload.wikimedia.org/wikipedia/vi/thumb/9/97/Logo_HTV7.svg/200px-Logo_HTV7.svg.png',
    group: '⚽ Thể Thao',
    url: 'https://live.htv.com.vn/htv_thethao_hd/index.m3u8',
  },
  {
    name: 'VTV5 Tây Nam Bộ',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/VTV5_logo_2013_final.svg/200px-VTV5_logo_2013_final.svg.png',
    group: '⚽ Thể Thao',
    url: 'https://vtv5-hls.vtvgo.vn/vtv5/vtv5.m3u8',
  },
  // ⭐ KÊNH YÊU THÍCH / PHIM TRUYỆN (DRM CLEARKEY & MPD)
  {
    name: 'HBO HD (ClearKey Base64)',
    logo: 'https://i.pinimg.com/originals/8b/02/00/8b020050690f955ccb306cdf51324aea.png',
    group: '⭐ KÊNH YÊU THÍCH',
    url: 'https://s2129134.cdn.mytvnet.vn/pkg20/live_dzones/hbo.smil/manifest.mpd',
    drmKey: 'Cd3+PWOGPK+ut50FRrCYqw:PeDzjc8BSCff1b7Dh0PGog',
    licenseType: 'org.w3.clearkey',
    userAgent: 'Dalvik/2.1.0',
  },
  {
    name: 'Cinemax HD (ClearKey Hex)',
    logo: 'https://raw.githubusercontent.com/vuminhthanh12/Logo/refs/heads/main/cinemax.png',
    group: '⭐ KÊNH YÊU THÍCH',
    url: 'https://s2129134.cdn.mytvnet.vn/pkg20/live_dzones/max.smil/manifest.mpd',
    drmKey: 'acb4c23471063327adc732e283c0847f:e9868f5f473d0fd8699ede48d531c2b0',
    licenseType: 'org.w3.clearkey',
    userAgent: 'Dalvik/2.1.0',
  },
  {
    name: 'Cinema World (ClearKey JSON JWK)',
    logo: 'https://www.voilah.sg/wp-content/uploads/2020/04/cinema-world-2.png',
    group: '⭐ KÊNH YÊU THÍCH',
    url: 'https://s2129134.cdn.mytvnet.vn/pkg20/live_dzones/cinemaworld.smil/manifest.mpd',
    drmKey: '{"keys":[{"kty":"oct","k":"s14Sp1pCpvkYRyOpD/QtnA","kid":"7nkVVk10OdCb01Vv/MyHpA"}]}',
    licenseType: 'org.w3.clearkey',
    userAgent: 'Dalvik/2.1.0',
  },
  // 📺 VTV
  {
    name: 'VTV1 HD',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/VTV1_logo_2013_final.svg/200px-VTV1_logo_2013_final.svg.png',
    group: '📺 VTV',
    url: 'https://vtv1-hls.vtvgo.vn/vtv1/vtv1.m3u8',
  },
  {
    name: 'VTV2 HD',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/VTV2_logo_2013_final.svg/200px-VTV2_logo_2013_final.svg.png',
    group: '📺 VTV',
    url: 'https://vtv2-hls.vtvgo.vn/vtv2/vtv2.m3u8',
  },
  {
    name: 'VTV3 HD',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/VTV3_logo_2013_final.svg/200px-VTV3_logo_2013_final.svg.png',
    group: '📺 VTV',
    url: 'https://vtv3-hls.vtvgo.vn/vtv3/vtv3.m3u8',
  },
  {
    name: 'VTV4 HD',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/VTV4_logo_2013_final.svg/200px-VTV4_logo_2013_final.svg.png',
    group: '📺 VTV',
    url: 'https://vtv4-hls.vtvgo.vn/vtv4/vtv4.m3u8',
  },
  {
    name: 'VTV5 HD',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/VTV5_logo_2013_final.svg/200px-VTV5_logo_2013_final.svg.png',
    group: '📺 VTV',
    url: 'https://vtv5-hls.vtvgo.vn/vtv5/vtv5.m3u8',
  },
  {
    name: 'VTV Cần Thơ',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/VTV_Can_Tho_logo_2022.svg/200px-VTV_Can_Tho_logo_2022.svg.png',
    group: '📺 VTV',
    url: 'https://vtv6-hls.vtvgo.vn/vtv6/vtv6.m3u8',
  },
  // 📺 HTV & HTVC
  {
    name: 'HTV7 HD',
    logo: 'https://upload.wikimedia.org/wikipedia/vi/thumb/9/97/Logo_HTV7.svg/200px-Logo_HTV7.svg.png',
    group: '📺 HTV & HTVC',
    url: 'https://live.htv.com.vn/htv7_hd/index.m3u8',
  },
  {
    name: 'HTV9 HD',
    logo: 'https://upload.wikimedia.org/wikipedia/vi/thumb/b/b3/Logo_HTV9.svg/200px-Logo_HTV9.svg.png',
    group: '📺 HTV & HTVC',
    url: 'https://live.htv.com.vn/htv9_hd/index.m3u8',
  },
  // 📍 ĐỊA PHƯƠNG
  {
    name: 'THVL1 HD',
    logo: 'https://upload.wikimedia.org/wikipedia/vi/thumb/4/47/Logo_THVL1.svg/200px-Logo_THVL1.svg.png',
    group: '📍 Địa Phương',
    url: 'https://live.thvli.vn/thvl1/index.m3u8',
  },
  {
    name: 'THVL2 HD',
    logo: 'https://upload.wikimedia.org/wikipedia/vi/thumb/c/cd/Logo_THVL2.svg/200px-Logo_THVL2.svg.png',
    group: '📍 Địa Phương',
    url: 'https://live.thvli.vn/thvl2/index.m3u8',
  },
  {
    name: 'Hà Nội 1 (HN1)',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Logo_HanoiTV.png/200px-Logo_HanoiTV.png',
    group: '📍 Địa Phương',
    url: 'https://live.hanoitv.vn/hanoitv1/index.m3u8',
  },
  // 📰 TIN TỨC
  {
    name: 'Truyền Hình Quốc Phòng (QPVN)',
    logo: 'https://upload.wikimedia.org/wikipedia/vi/thumb/8/87/Logo_QPVN.svg/200px-Logo_QPVN.svg.png',
    group: '📰 Tin Tức',
    url: 'https://live.qpvn.vn/qpvn/index.m3u8',
  },
  {
    name: 'Truyền Hình Công An (ANTV)',
    logo: 'https://upload.wikimedia.org/wikipedia/vi/thumb/6/64/Logo_ANTV.svg/200px-Logo_ANTV.svg.png',
    group: '📰 Tin Tức',
    url: 'https://live.antv.gov.vn/antv/index.m3u8',
  },
  {
    name: 'Truyền Hình Quốc Hội VN',
    logo: 'https://upload.wikimedia.org/wikipedia/vi/thumb/1/15/Logo_QuochoiTV.svg/200px-Logo_QuochoiTV.svg.png',
    group: '📰 Tin Tức',
    url: 'https://live.quochoitv.vn/quochoi/index.m3u8',
  },
  {
    name: 'VTC1 HD Tin Tức',
    logo: 'https://upload.wikimedia.org/wikipedia/vi/thumb/a/a2/Logo_VTC1.svg/200px-Logo_VTC1.svg.png',
    group: '📰 Tin Tức',
    url: 'https://live.vtc.gov.vn/vtc1/index.m3u8',
  },
  {
    name: 'VOV TV',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Logo_VOVTV.svg/200px-Logo_VOVTV.svg.png',
    group: '📰 Tin Tức',
    url: 'https://live.vov.vn/vovtv/index.m3u8',
  }
];
