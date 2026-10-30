// Small shared pieces of the Eleusinia interface: icons, portraits, emblems, dialogs and ornaments.
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { type Group, type Key, type Profile, identicon } from '../shared/protocol'

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
  wifi: <path d="M2.5 9a13.5 13.5 0 0 1 19 0M5.5 12.5a9 9 0 0 1 13 0M8.6 15.9a4.6 4.6 0 0 1 6.8 0M12 19.5h.01" />,
  rotate: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5" />,
  screen: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  collapse: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  volume: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  camera: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2" />
      <path d="M15.5 10.5 21.5 7v10l-6-3.5" />
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
  attach: <path d="M20 11.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8.1-8.1a3.3 3.3 0 0 1 4.7 4.7l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4L14.8 7" />,
  file: <path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5zM13.5 3.5v5h5" />,
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />,
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

// A person's portrait: their uploaded picture, or a pattern drawn from their public key. With `online` set,
// a presence mark is added: filled when online, hollow when offline, so it does not rely on colour alone.
export function Avatar({ k, p, size = 32, online }: { k: Key; p: Profile; size?: number; online?: boolean }) {
  const { hue, cells } = identicon(k)
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {p.avatar ? (
        <img src={p.avatar} alt="" />
      ) : (
        <svg viewBox="0 0 5 5" aria-hidden="true" style={{ background: `hsl(${hue} 38% 18%)` }}>
          {cells.map((on, i) => on && <rect key={i} x={i % 5} y={Math.floor(i / 5)} width={1.02} height={1.02} fill={`hsl(${hue} 70% 72%)`} />)}
        </svg>
      )}
      {online !== undefined && <span className={online ? 'presence on' : 'presence'} title={online ? 'Online' : 'Offline'} />}
    </span>
  )
}

// A group's tile: its first letter on a tinted stone square, coloured from the group id.
export function GroupEmblem({ g, size = 32 }: { g: Group; size?: number }) {
  const hue = 190 + (parseInt(g.id.slice(0, 4), 16) % 80)
  if (g.avatar) return <img className="crest" src={g.avatar} alt="" style={{ width: size, height: size }} />
  return (
    <span className="crest" style={{ width: size, height: size, fontSize: size * 0.46, ['--hue' as string]: hue }} aria-hidden="true">
      {(g.name.trim()[0] ?? '?').toUpperCase()}
    </span>
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
        <button className="icon-button dialog-close" onClick={close} aria-label="Close">
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

const [MIN_W, MAX_W] = [180, 480]
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
