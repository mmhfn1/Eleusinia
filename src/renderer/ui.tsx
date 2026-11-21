// Small shared pieces of the Eleusinia interface: icons, portraits, emblems, dialogs and ornaments.
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { type Drawing, type Weave, WEAVES, banner, bytesOf, defaultWeave, picture, tones } from '../shared/mark'
import { type Banner, type GifRef, type Group, type Key, MAX_MEDIA, type Profile, type ServerView } from '../shared/protocol'
import { api } from './common'
import { GifPicker, type Picked, gifFile } from './Gifs'

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </>
  ),
  micOff: (
    <>
      <path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M18.5 11a6.5 6.5 0 0 1-1.1 3.6M5.5 11a6.5 6.5 0 0 0 10.4 5.2M12 17.5V21M9 21h6" />
      <path d="M4 4l16 16" />
    </>
  ),
  phone: <path d="M5.2 3.5h3.1l1.9 4.8-2.4 1.5a11 11 0 0 0 6.4 6.4l1.5-2.4 4.8 1.9v3.1a1.8 1.8 0 0 1-1.9 1.8A16.5 16.5 0 0 1 3.4 5.4a1.8 1.8 0 0 1 1.8-1.9z" />,
  send: <path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  userPlus: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" />
    </>
  ),
  headphones: <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z" />,
  headphonesOff: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 12.5-6.6M20 12v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z" />
      <path d="M3 3l18 18" />
    </>
  ),
  leave: <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />,
  trash: <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />,
  wave: <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />,
  wifi: <path d="M2.5 9a13.5 13.5 0 0 1 19 0M5.5 12.5a9 9 0 0 1 13 0M8.6 15.9a4.6 4.6 0 0 1 6.8 0M12 19.5h.01" />,
  rotate: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5" />,
  screen: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  collapse: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  volume: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  camera: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2" />
      <path d="M15.5 10.5 21.5 7v10l-6-3.5" />
    </>
  ),
  cameraOff: (
    <>
      <path d="M15.5 13v3a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.5M9.5 6h4a2 2 0 0 1 2 2v2.5L21.5 7v10" />
      <path d="M3 3l18 18" />
    </>
  ),
  screenOff: (
    <>
      <path d="M8 4h11.5A1.5 1.5 0 0 1 21 5.5V15M17 16H4.5A1.5 1.5 0 0 1 3 14.5v-9A1.5 1.5 0 0 1 4 4" />
      <path d="M8 20h8M12 16v4M3 3l18 18" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  gif: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M10 9.5H8a1.5 1.5 0 0 0-1.5 1.5v2A1.5 1.5 0 0 0 8 14.5h2V12M13 9.5v5M16 14.5v-5h2.5M16 12h2" />
    </>
  ),
  attach: <path d="M20 11.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8.1-8.1a3.3 3.3 0 0 1 4.7 4.7l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4L14.8 7" />,
  file: <path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5zM13.5 3.5v5h5" />,
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />,
  hash: <path d="M5 9h15M4 15h15M10 3.5 8 20.5M16 3.5l-2 17" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9.5" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  folder: <path d="M3.5 7V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9a1.5 1.5 0 0 0-1.5-1.5h-7L10 5H5A1.5 1.5 0 0 0 3.5 6.5z" />,
}

export function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

// Logos of the services Settings connects to (Simple Icons, CC0), filled with the text colour.
const BRANDS = {
  steam:
    'M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z',
  bungie: 
    'm23.864 12.77-1.1007-.8182V.4648L12.4037.9653 2.044.4656v2.9316L.4312 2.7555c-.06-.0253-.227-.0542-.3499.0823-.1358.1509-.0945.384.0753.484.629.389 1.2582.7778 1.8874 1.1665v7.538c.015 3.2383 2.4585 5.9808 4.8684 7.9678 2.3723 1.9447 4.7727 3.1716 5.0747 3.323.07.0362.2156.1098.4323.218l.4-.2188c.2-.0996 2.6523-1.3367 5.0748-3.323 2.1925-1.8066 4.4-4.2416 4.7946-7.1025l.8598.4236c.1934.0967.4625-.05.451-.2981-.0065-.1693-.1358-.2444-.1357-.2463zM2.408.8476l9.9957.4817c3.3321-.16 6.6643-.3215 9.9964-.4824V11.681l-.4918-.3655.0039-.3609V1.3042l-9.5038.4628-9.503-.4628v2.435l-.4974-.1977Zm15.9223 2.941v-.4464h1.638l-.9531 2.2562h-.5288l.7837-1.8098zM11.857 8.5472c.2416.0972.371.342.371.342l.5955 1.0888 1.9368 1.2795c-.1718.3114-.2337.5578-.2651.6558a.897.897 0 0 0-.0196.0714l.2777 1.4654c-.0142.0047-.0275.0063-.0416.011-.4038.134-.7649.3613-1.1351.5656-.255.1432-.3047.1696-.4323.2157-.355.128-.606.0754-.8198.0164-.0286-.0082-.0575-.0152-.0863-.0228-.2338-.0431-.5844-.3444-.866-.586-.3921-.3351-.5167-.434-.8096-.5664-.0137-.0074-.0283-.013-.0424-.0195l.448-1.5713c-.5937-.966-1.1863-1.9328-1.7792-2.8993a.1434.1434 0 0 1 .0126-.1891l1.2112-2.2538c.0443-.069.1362-.0816.1961-.0423.8363.3395 1.658.7123 2.4812 1.0817.0714.029.1036.113.0738.1867l-.5436.8684c-.0332.0802-.1212.1068-.1836.08l-1.2426-.498-.1874.3082c-.0024.0008.193.0777.8503.4119zm6.7692 6.9738c.0572.1608-.1389.3452-.1805.4903-.0172.0596-.0086.1397-.0298.2016-.0886.2503-.2879.4676-.4165.6974a.2579.2579 0 0 1-.1004-.0306c-.1342-.073.3036-.5828.3389-.644.0839-.1428-.728-.1428-.775-.1663-.1695-.0832-.2958-.3005-.361-.47-.0666-.174-.1223-.495.1036-.5757.0977-.0379.2105.0163.317-.022.0823-.0306.1537-.1263.207-.1867-.2384-.1915-.4612-.2605-.6809-.2605-.3781 0-.7476.2055-1.1728.3538-.2886.055-.5561.098-.6754.1224-.5083.1035-1.015.5397-1.4167.673-.6198.2249-1.1461.1914-1.1971.1875-.5797-.0455-.9579-.0494-1.827-.7829-.452-.3575-.568-.6149-1.7447-.862-.5201-.1043-.9947-.2259-.9665-.5161.0079-.1828.3177-.3562.237-.5398-.0424-.0964-.084-.3286-.0134-.48-.149-.2825-.2855-.3444-.6888-.47-.2398-.0747-.437-.07-.4502-.0674.0156.0808.0196.1656.0054.2464-.0365.1955-.1314.6952-.5161.6314-.0165-.0447.1655-.2541-.1255-.5961-.175-.2017-.5296-.7782-.146-1.0528.4331-.3031.9909-.1012 1.3227.073.103.0886.8765.1811 1.2347.2557.4244.084.7484.4778.4503.7735-.1938.1593-.5036.3781-.353.448.103.023.5009.1161.5766.1373.229.062.491.1412.717.2314.0085.0031.236.0972.3577.1757.4377.2809 1.0308.965 1.5195 1.056.0847.0195.28.0901.5475.0901.3937 0 .7335-.1807.8308-.2377.0651-.0345.1279-.0698.1914-.105.368-.2072.7092-.415 1.066-.5343.2852-.095.4896-.0988.5178-.0988.2503-.0283.4911-.0424.5664-.0667.3742-.1177.757-.2534 1.1477-.2534.5264 0 .8862.245 1.157.6103.0777.1043.4606.641.3562.7743-.116.1506-.3702.3106-.4016.5115-.0304.2039.07.2033.198.1902.128-.013.2343-.0217.2727.088zm-4.5452 2.8908c.0478.0016.0298.066.0635.051.0322-.0157.0596-.0204.0792.033.0251.0698-.065.0416-.0415.0714.0306.04-.0738.1835-.1389.215-.0651.0297-.0627-.0503-.1106-.051-.0494-.0017-.0337.0305-.0565-.0103-.0227-.04-.0063-.0722.0189-.0949.025-.0235-.004-.0651-.004-.0651l-.1192-.375-.9986.8112 1.0041.8911s.164.3436.0824.3397c-.2008-.0071-.3366-.0361-.3366-.0361l-1.11-.9021-1.11.9021s-.1357.029-.3365.036c-.0824.0032.0823-.3396.0823-.3396l1.0042-.8911-.9987-.8112-.1192.375s-.029.0416-.004.0651c.0252.0235.0417.055.019.095-.0228.0407-.0072.0085-.0566.0101-.0478.0008-.0455.0808-.1106.051-.065-.0306-.1694-.175-.1388-.215.0235-.0297-.0667-.0007-.0424-.0713.0196-.0534.0463-.0487.0792-.033.0338.015.015-.0486.0636-.051.0698-.0016.0988-.5232.0988-.5232l-.6166-.5444-.091-.1075s-.0965.0188-.1623-.0431c-.0667-.062-.0863-.2354-.0204-.3146.062-.0738.1945-.0879.309.0227.0651.062.0526.1318.0526.1318l.1114.0942.6519.4957s.5177-.1757.513-.2235c-.0047-.0479.0612-.0377.0424-.0683-.0196-.0298-.0283-.0572.0243-.0823.0667-.033.0486.0596.076.0329.0362-.0353.1954.047.2339.1075.0376.0604-.0432.0674-.0385.116.0047.0471.0353.0291-.0024.0558-.0376.0282-.0721.0141-.098-.0078-.037-.029-.0165-.044-.0165-.044l-.4064.2723 1.0065.8935 1.0065-.8935-.4064-.2723s.0204.015-.0164.044c-.026.022-.0604.0353-.0981.0078-.0377-.0267-.0071-.0086-.0024-.0557.0047-.0487-.076-.0557-.0384-.1161.0392-.0604.1976-.1428.2337-.1075.0267.0267.0094-.0667.0761-.033.0526.0252.0447.0526.0243.0824-.0188.0306.0471.0204.0424.0683-.0039.0478.513.2235.513.2235l.652-.4957.1113-.0942s-.0133-.0698.0518-.1318c.1145-.1106.2471-.0965.309-.0227.066.0792.0464.2526-.0203.3146-.066.062-.1624.0431-.1624.0431l-.091.1075-.6166.5444c.0012-.0004.0341.5232.1005.5232zM12.089 6.459c-.1982-.0848-.3838-.1637-1.2763-.5452l.7719-1.2998a.144.144 0 0 1 .1945-.0502l.9469.56a.1412.1412 0 0 1 .051.193zm.9367-.9837c.0426-.0698.1337-.0853.1953-.047l.8653.5122a.14.14 0 0 1 .047.1938c-.1688.2688-.4737.7593-.6887 1.1045a.4022.4022 0 0 0-.164-.2244.3808.3808 0 0 0-.0972-.0596l-.8379-.3758Zm1.2763.8715a.1432.1432 0 0 1 .1962-.0455l.7781.4582a.141.141 0 0 1 .0455.1937c-.8974 1.4307-1.0436 1.667-1.2983 2.0734-.0063.011-.011.022-.0165.033a.141.141 0 0 1-.1906.04l-.7774-.459c-.1067-.0648-.053-.1937-.0455-.1937.0057 0 .466-.7403 1.3085-2.1zm1.1477.8888a.1462.1462 0 0 1 .1969-.0462l.6166.3679a.1401.1401 0 0 1 .047.1937L15.1 9.6784c-.0447.071-.1377.0833-.1954.0463l-.6181-.3687a.1383.1383 0 0 1-.0455-.193zM.2868 3.1015c-.0536-.0318-.0323-.1258.0502-.1068L7.224 5.7325l-.1295-2.4044 3.4893 2.4703s-.04-.0165-.0996-.0165c-.1155 0-.2056.0594-.229.117-.2357.4394-.4724.8785-.7084 1.3178l-.888-.6205-.375 1.4466Zm17.376 16.6118c-2.3864 1.958-4.8198 3.1865-5.012 3.2822l-.2393.1302c-.0825-.0422-.1652-.0842-.2479-.1263-.211-.1043-2.6389-1.332-5.0198-3.2861-2.3855-1.9596-4.7334-4.6456-4.7358-7.687v-7.312c.1663.1017.3316.205.4974.3075v7.0076c0 5.7988 8.9264 10.3456 9.3069 10.5362l.2047.1043.1899-.1043c.3687-.186 8.8205-4.4958 9.2778-10.0702.1528.0746.305.1506.4574.226-.3232 2.7534-2.4766 5.1837-4.6794 6.9919zm6.0239-6.624h-.0016c-.0086 0-.022-.004-.022-.004l-5.5383-2.7284-.3805 2.5566-4.651-3.1112-.637-1.1735L14.495 9.781l.2761.1648c.0694.0428.1822.0604.2165.0604.2125 0 .3294-.1921.3295-.1922l.1482-.2361.142-.2095 1.074.8865.3412-2.2522 6.693 4.9774c.0502.0326.0274.1076-.029.109z',
}
export function Brand({ name, size = 24 }: { name: keyof typeof BRANDS; size?: number }) {
  return (
    <svg className="brand" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={BRANDS[name]} />
    </svg>
  )
}

// The Eleusinia emblem (the logo), tinted by CSS so it can be moonlit marble, gold or faint violet.
export function Emblem({ size, className = '' }: { size: number; className?: string }) {
  return <span className={`emblem ${className}`} style={{ width: size, height: size }} aria-hidden="true" />
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      Eleusinia
    </span>
  )
}

// Shapes from shared/mark.ts as an SVG.
export function Drawn({ d, slice, className }: { d: Drawing; slice?: boolean; className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${d.w} ${d.h}`} preserveAspectRatio={slice ? 'xMidYMid slice' : undefined} aria-hidden="true">
      {d.shapes.map((s, i) => {
        const T = s.tag
        return <T key={i} {...s.a} />
      })}
    </svg>
  )
}

// A person's portrait: their uploaded picture, or a built form drawn from their public key (shared/mark.ts). With
// `online` set, a presence mark is added: filled when online, hollow when offline, so it does not rely on colour alone.
export function Avatar({ k, p, size = 32, online }: { k: Key; p: Profile; size?: number; online?: boolean }) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {p.avatar ? p.gif ? <GifImg g={p.gif} by={k} still={p.avatar} /> : <img src={p.avatar} alt="" /> : <Drawn d={picture(k)} />}
      {online !== undefined && <span className={online ? 'presence on' : 'presence'} title={online ? 'Online' : 'Offline'} />}
    </span>
  )
}

// A person's or server's GIF (protocol.ts GifRef): its still until the GIF itself is here, fetched by hash from its
// owner or anyone showing it. One listener for all of them, so a member list full of GIFs adds no more.
const gifWaits = new Map<string, Set<() => void>>()
let gifEvents: (() => void) | null = null
export function GifImg({ g, by, still, className }: { g: GifRef; by?: Key; still: string; className?: string }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    let gone = false
    const ready = () => !gone && setDone(true)
    setDone(false)
    gifEvents ??= api.on((e) => e.type === 'file' && e.file.state === 'done' && gifWaits.get(e.file.h)?.forEach((f) => f()))
    const waits = gifWaits.get(g.h) ?? new Set()
    gifWaits.set(g.h, waits.add(ready))
    api.call('openGif', g, by).then((f) => f?.state === 'done' && ready(), () => {})
    return () => {
      gone = true
      waits.delete(ready)
      if (!waits.size) gifWaits.delete(g.h)
    }
  }, [g.h, by])
  return <img className={className} src={done ? `eleusinia-file://${g.h}` : still} alt="" />
}

// A group's (or server's) tile: its picture, or a built form drawn from its id.
export function GroupEmblem({ g, size = 32 }: { g: Pick<Group, 'id' | 'name' | 'avatar'> & { gif?: GifRef }; size?: number }) {
  if (g.avatar && g.gif) return <span className="crest" style={{ width: size, height: size }}><GifImg g={g.gif} still={g.avatar} /></span>
  if (g.avatar) return <img className="crest" src={g.avatar} alt="" style={{ width: size, height: size }} />
  return (
    <span className="crest drawn" style={{ width: size, height: size }} aria-hidden="true">
      <Drawn d={picture(g.id)} />
    </span>
  )
}

// A banner woven from a key or id (shared/mark.ts); fills its parent.
export function Woven({ id, weave, tall }: { id: string; weave?: Weave; tall?: boolean }) {
  return <Drawn className="woven" d={banner(id, weave, !tall)} slice />
}

// A picture's colour, the most saturated pixels weighing most, brought to a lightness both themes read well
function colourOf(src: string): Promise<string> {
  return new Promise((ok, no) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 12
        const x = c.getContext('2d')!
        x.drawImage(img, 0, 0, 12, 12)
        const d = x.getImageData(0, 0, 12, 12).data
        let r = 0, g = 0, b = 0, w = 0
        for (let i = 0; i < d.length; i += 4) {
          const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2])
          const s = max ? (max - min) / max : 0
          const k = 0.05 + s * s
          r += d[i] * k
          g += d[i + 1] * k
          b += d[i + 2] * k
          w += k
        }
        const h = Math.round((Math.atan2(Math.sqrt(3) * (g / w - b / w), 2 * (r / w) - g / w - b / w) * 180) / Math.PI + 360) % 360
        ok(`hsl(${h} 55% 62%)`)
      } catch (e) {
        no(e)
      }
    }
    img.onerror = no
    img.src = src
  })
}

// A person's accent: the colour of what their banner shows (game art, their picture or their own banner picture), else
// their weave's tone. Profiles set it as --person, which is a registered colour, so a change fades rather than jumps.
export function useAccent(id: string, p: Profile, app?: number) {
  const b = p.banner
  const src = app ? `eleusinia-art://steam/${app}/header` : b && 'pic' in b ? b.pic : (!b || 'fade' in b) && p.avatar ? p.avatar : null
  const fallback = tones(bytesOf(id), b && 'kind' in b ? b.shift : 0)[1]
  const [c, setC] = useState(fallback)
  useEffect(() => {
    let gone = false
    if (!src) setC(fallback)
    else colourOf(src).then((x) => !gone && setC(x), () => !gone && setC(fallback))
    return () => void (gone = true)
  }, [src, fallback])
  return c
}

// A picture's first frame as a still: a GIF banner moves only where someone is looking at a profile
function useStill(src: string) {
  const [still, setStill] = useState('')
  useEffect(() => {
    let gone = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        c.getContext('2d')!.drawImage(img, 0, 0)
        if (!gone) setStill(c.toDataURL('image/jpeg', 0.85))
      } catch {
        if (!gone) setStill(src)
      }
    }
    img.onerror = () => !gone && setStill(src)
    img.src = src
    return () => void (gone = true)
  }, [src])
  return still
}
function StillImg({ src, className }: { src: string; className: string }) {
  const still = useStill(src)
  return still ? <img className={className} src={still} alt="" /> : null
}

// A seal beside a name: we compared this person's key with them, so it is really them
export function VerifiedSeal() {
  return (
    <span className="verified-seal" title="Verified in person: you compared their key">
      <Icon name="check" size={11} />
    </span>
  )
}

// What a person's banner shows: their own picture or GIF, their picture softened, or a weave from their key. With no
// choice made, their picture softened if they have one, else their key's weave.
// still: drawn from the first frame, so a GIF banner does not move (call banners, cards on Home)
export function BannerArt({ id, p, tall, still }: { id: string; p: Profile; tall?: boolean; still?: boolean }) {
  const b = p.banner
  if (b && 'pic' in b) return still ? <StillImg className="woven banner-pic" src={b.pic} /> : b.gif ? <GifImg className="woven banner-pic" g={b.gif} by={id} still={b.pic} /> : <img className="woven banner-pic" src={b.pic} alt="" />
  if ((!b || 'fade' in b) && p.avatar) return still ? <StillImg className="woven banner-fade" src={p.avatar} /> : <img className="woven banner-fade" src={p.avatar} alt="" />
  return <Woven id={id} weave={b && 'kind' in b ? b : undefined} tall={tall} />
}

// A picture cut to cover w x h, as a JPEG data URL of at most max characters: for a GIF, its first frame, the still
// a profile or server keeps beside it
export async function cover(file: Blob, w: number, h: number, max = MAX_MEDIA): Promise<string> {
  const img = await createImageBitmap(file)
  const scale = Math.min(img.width / w, img.height / h), sw = w * scale, sh = h * scale
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h)
  img.close()
  for (let q = 0.85; q > 0.2; q -= 0.1) {
    const url = c.toDataURL('image/jpeg', q)
    if (url.length <= max) return url
  }
  throw new Error('That picture is too detailed to use')
}
// A GIF picked or uploaded as a picture or banner: its still at that size, and the GIF itself by hash
export const gifPicture = async ({ ref, data }: Picked, w: number, h: number, max = MAX_MEDIA) => ({ still: await cover(new Blob([data as BlobPart]), w, h, max), gif: { h: ref.h, s: ref.s } })

// A chosen banner picture: a GIF as it is (so it still moves), anything else cut to a wide 1200 x 440 JPEG
const bannerFrom = async (file: File): Promise<Banner> => {
  if (file.type !== 'image/gif') return { pic: await cover(file, 1200, 440) }
  const { still, gif } = await gifPicture(await gifFile(file), 1200, 440)
  return { pic: still, gif }
}

// The banner choices: your picture softened, the four weaves of your key (with their tones), or an upload
export function BannerPick({ id, p, set }: { id: string; p: Profile; set: (b: Banner) => void }) {
  const [err, setErr] = useState('')
  const [gifs, setGifs] = useState(false)
  const b = p.banner
  const on = b && 'pic' in b ? 'pic' : b && 'kind' in b ? b.kind : b || p.avatar ? 'fade' : defaultWeave(id).kind
  const weave = b && 'kind' in b ? b : { kind: defaultWeave(id).kind, shift: 0 }
  return (
    <div className="weave-pick">
      <div className="weave-kinds" role="radiogroup" aria-label="Banner">
        <button type="button" role="radio" aria-checked={on === 'fade'} className={`weave-kind ${on === 'fade' ? 'on' : ''}`} onClick={() => set({ fade: true })}>
          <BannerArt id={id} p={{ ...p, banner: { fade: true } }} tall />
          <span>Your picture</span>
        </button>
        {WEAVES.map((name, kind) => (
          <button key={name} type="button" role="radio" aria-checked={on === kind} className={`weave-kind ${on === kind ? 'on' : ''}`} onClick={() => set({ kind, shift: weave.shift })}>
            <Woven id={id} weave={{ kind, shift: weave.shift }} tall />
            <span>{name}</span>
          </button>
        ))}
        <label role="radio" aria-checked={on === 'pic'} className={`weave-kind upload ${on === 'pic' ? 'on' : ''}`}>
          {b && 'pic' in b ? <img className="woven banner-pic" src={b.pic} alt="" /> : <Icon name="attach" size={20} />}
          <span>{b && 'pic' in b ? 'Change' : 'Upload'}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="visually-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = '' // so the same file can be chosen again
              if (f) bannerFrom(f).then((b) => (setErr(''), set(b)), (x) => setErr(String(x.message ?? x)))
            }}
          />
        </label>
        <button type="button" className="weave-kind upload" onClick={() => setGifs(true)}>
          <Icon name="gif" size={20} />
          <span>GIF</span>
        </button>
      </div>
      {typeof on === 'number' && (
        <label className="weave-tones">
          Tones
          <input type="range" min={0} max={359} value={weave.shift} onChange={(e) => set({ ...weave, shift: +e.target.value })} />
          <button type="button" className="button subtle" onClick={() => set({ ...weave, shift: Math.floor(Math.random() * 360) })}>
            Shuffle
          </button>
        </label>
      )}
      {err && <span className="form-error">{err}</span>}
      {gifs && <GifPicker close={() => setGifs(false)} pick={(g) => gifPicture(g, 1200, 440).then(({ still, gif }) => (setErr(''), set({ pic: still, gif })))} />}
    </div>
  )
}

// A server's banner behind its name: the weave its id gives or the one chosen, a picture, or a game's art, darkened
// as chosen so the name stays readable.
export function ServerBannerArt({ sv, b = sv.banner }: { sv: Pick<ServerView, 'id' | 'banner'>; b?: ServerView['banner'] }) {
  const src = b && 'pic' in b ? b.pic : b && 'app' in b ? `eleusinia-art://steam/${b.app}/header` : null
  return (
    <span className="server-banner" aria-hidden="true" style={{ ['--dark' as string]: b?.dark ?? 45 }}>
      {b && 'pic' in b && b.gif ? <GifImg g={b.gif} still={b.pic} /> : src ? <img src={src} alt="" /> : <Woven id={sv.id} weave={b && 'kind' in b ? b : undefined} />}
    </span>
  )
}

// The four weaves a key can give, each drawn from that key, and how far its tones turn.
export function WeavePick({ id, value, set, disabled }: { id: string; value?: Weave; set: (w: Weave) => void; disabled?: boolean }) {
  const w = value ?? defaultWeave(id)
  return (
    <div className="weave-pick">
      <div className="weave-kinds" role="radiogroup" aria-label="Pattern">
        {WEAVES.map((name, kind) => (
          <button key={name} type="button" role="radio" aria-checked={w.kind === kind} className={`weave-kind ${w.kind === kind ? 'on' : ''}`} disabled={disabled} onClick={() => set({ ...w, kind })}>
            <Woven id={id} weave={{ kind, shift: w.shift }} tall />
            <span>{name}</span>
          </button>
        ))}
      </div>
      <label className="weave-tones">
        Tones
        <input type="range" min={0} max={359} value={w.shift} disabled={disabled} onChange={(e) => set({ ...w, shift: +e.target.value })} />
        <button type="button" className="button subtle" disabled={disabled} onClick={() => set({ ...w, shift: Math.floor(Math.random() * 360) })}>
          Shuffle
        </button>
      </label>
    </div>
  )
}

// An (i) button whose explanation shows while it is hovered or focused, and is read out as its description.
export function Info({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span className="info">
      <button type="button" className="info-icon" aria-label="More information" aria-describedby={id}>
        <Icon name="info" size={16} />
      </button>
      <span role="tooltip" id={id} className="tip">
        {children}
      </span>
    </span>
  )
}

// A modal dialog: Esc or a click on the dimmed backdrop closes it.
export function Dialog({ label, close, children, className = '' }: { label: string; close: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current!
    d.showModal()
    // Start in the first text field if there is one, otherwise on the dialog itself rather than its close button.
    ;(d.querySelector<HTMLElement>('input:not([type=checkbox]), textarea') ?? d.querySelector<HTMLElement>('.dialog-body'))?.focus()
  }, [])
  return (
    <dialog ref={ref} className={className} onClose={close} onClick={(e) => e.target === ref.current && close()} aria-label={label}>
      <div className="dialog-body" tabIndex={-1}>
        <button type="button" className="icon-button dialog-close" onClick={close} aria-label="Close">
          <Icon name="close" />
        </button>
        {children}
      </div>
    </dialog>
  )
}

export function copyText(text: string) {
  navigator.clipboard.writeText(text)
}

// A copy button that briefly confirms it worked.
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="icon-button"
      aria-label={done ? 'Copied' : label}
      title={done ? 'Copied' : label}
      onClick={() => {
        copyText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={16} />
    </button>
  )
}

const [MIN_W, MAX_W] = [180, 640]
// A column's default: a share of the window, so wide screens get wide columns rather than a vast middle
// One width per side for every view (Home, DMs, groups, servers), so moving between them never shifts the columns;
// the shares are a group's columns on a 1920 px window: 421 px left, 378 px right
export const leftWidth = () => fit(0.22, 300, 520)
export const rightWidth = () => fit(0.197, 280, 480)
export const fit = (share: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, window.innerWidth * share)))
// A sidebar width the user can drag, remembered on this computer.
export function useWidth(id: string, initial: number) {
  const [w, setW] = useState(() => Number(localStorage.getItem('width-' + id)) || initial)
  const set = (v: number) => {
    const clamped = Math.max(MIN_W, Math.min(MAX_W, Math.round(v)))
    setW(clamped)
    localStorage.setItem('width-' + id, String(clamped))
  }
  return [w, set] as const
}

// Drag handle on a sidebar's inner edge. `dir` is 1 when dragging right widens the sidebar, -1 when it narrows it.
export function Splitter({ label, width, set, dir }: { label: string; width: number; set: (v: number) => void; dir: 1 | -1 }) {
  const from = useRef({ x: 0, w: 0 })
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    from.current = { x: e.clientX, w: width }
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) set(from.current.w + (e.clientX - from.current.x) * dir)
  }
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') set(width + 16 * dir)
    if (e.key === 'ArrowLeft') set(width - 16 * dir)
  }
  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={MIN_W}
      aria-valuemax={MAX_W}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onKeyDown={key}
    />
  )
}
