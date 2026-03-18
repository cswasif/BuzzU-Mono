You are working inside a live repository with full context. Create a new component based on the HTML and CSS I provide.

Honor the current folder structure and coding conventions. If a `components` folder exists, split HTML/CSS across component files for modularity. Propose file paths up front and then produce patches/diffs for each file you add or change.

## Project alignment
- If Shadcn UI is present, follow its patterns (foldering, `@/components/ui/*`, `cn` util, variants).
- If an icon library is present, replace inline SVGs with icons from that library.
- If the project uses TypeScript, make the component fully type-safe. Match the repo's preference for `interface` vs `type`.
- If the app is Next.js and uses `next/image`, use it for images.
- Use loops for repeated structures.
- Copy the HTML verbatim (except for the explicit rules above). Do not alter semantics.
- Prefer small, focused subcomponents rather than one large component.

## HTML and CSS

This html and css is extracted from `https://app.chitchat.gg/chat/new` via the selector `div.bg-panel.px-1.relative.z-10`. Don't call the component the name of the website, choose a name that is more generic.
The original background color for this html is `rgb(37, 38, 45)` (the color of the plane behind the html). When integrating the component into the project, make sure the background color of the location, where the new component is placed, matches the theme of the original background color. It doesn't need to be exactly the same, but the theme should match (light, dark, etc.).

**Important:**
The following CSS is Tailwind CSS. If the project uses Tailwind already, you must skip integrating the styles into the global/project css verbatim. Exceptions from this are any non standard Tailwind classes like JIT/arbitrary classes, for instance rules for `text-[#ff0000]`.

So if the project uses Tailwind, you should:
1. Analyze the CSS provided and filter out any default Tailwind classes
2. Find out how Tailwind is configured in the project
  - Tailwind V3 uses a tailwind.config.js file
  - Tailwind V4 uses a css based config and is most likely located in the main css file of the project
3. Look at any non standard Tailwind classes and integrate them into the Tailwind config

```html
<div class="bg-panel px-1 relative z-10" id="component"><button class="inline-flex disabled:select-none items-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-primary/90 h-10 py-2 mt-1.5 w-full justify-start bg-gradient-to-r from-pink-700 via-red-500 to-orange-500 px-2 sm:hidden text-brightness"><svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="mr-2 h-5 w-5 " height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 5h12l3 5l-8.5 9.5a.7 .7 0 0 1 -1 0l-8.5 -9.5l3 -5"></path>
      <path d="M10 12l-2 -2.2l.6 -1"></path>
    </svg>Get Premium</button>
  <div class="relative hidden flex-col justify-end pt-6 sm:flex select-text dark:text-foreground text-background"><img alt="crown-icon" loading="lazy" class="absolute -top-1.5 bottom-10 left-0 right-0 z-10 mx-auto" draggable="false" height="65" width="65" src="https://proxy.extractcss.dev/https://app.chitchat.gg/icons/crown.svg">
    <div class="rounded-lg relative w-56  justify-end self-center bg-gradient-to-tl from-indigo-700 to-purple-700 p-2 px-2 text-center ">
      <div class="text-md mt-6 font-bold"></div>
      <p class="pb-2 pt-2 text-xs">Unlock chat filters, Send and recieve images and videos and more!</p><button class="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-md p-0.5 font-bold"><span class="absolute h-full w-full bg-gradient-to-br from-[#ff8a05] via-[#ff5478] to-[#ff00c6] group-hover:from-[#ff00c6] group-hover:via-[#ff5478] group-hover:to-[#ff8a05]"></span><span class="duration-400 relative w-full rounded-md bg-gray-900 py-1 transition-all ease-out group-hover:bg-opacity-0"><span class="relative text-sm text-white flex items-center justify-center">Get Premium</span></span></button>
    </div>
  </div>
  <div data-orientation="horizontal" role="none" class="shrink-0 bg-border h-[1px] w-full my-1.5"></div>
  <div class="flex flex-row items-center gap-0.5 rounded-sm pb-1"><button class="disabled:select-none rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 inline-flex grow items-center justify-start gap-2 p-1">
      <div class="relative">
        <span class="flex shrink-0 overflow-hidden relative h-8 w-8 rounded-full" src="https://proxy.extractcss.dev/https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&amp;backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&amp;translateY=5&amp;&amp;seed=69ba56fbf9a61fc7264b4df5&amp;scale=110&amp;eyesColor=000000,ffffff&amp;faceOffsetY=0&amp;size=80" alt="brash dedication" username="brash dedication"><img class="aspect-square h-full w-full" alt="brash dedication" src="https://proxy.extractcss.dev/https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&amp;backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&amp;translateY=5&amp;&amp;seed=69ba56fbf9a61fc7264b4df5&amp;scale=110&amp;eyesColor=000000,ffffff&amp;faceOffsetY=0&amp;size=80"></span>
        <div class="absolute rounded-full ring-2 ring-zinc-700 h-2 w-2 bottom-0 right-0 mr-[1px] mb-[1px] bg-success" content="" color="secondary" shape="circle"></div>
      </div>
      <div class="flex w-20 flex-col items-start justify-around self-center">
        <span class="w-full text-start truncate text-sm font-bold leading-4">brash dedication</span><span class="text-xs leading-3">Free</span>
      </div>
    </button><button class="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8" data-state="closed"><svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 20 20" aria-hidden="true" height="17" width="17" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clip-rule="evenodd"></path>
      </svg></button><button class="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8" data-state="closed"><svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="17" width="17" xmlns="http://www.w3.org/2000/svg">
        <path d="M14.647 4.081a.724 .724 0 0 0 1.08 .448c2.439 -1.485 5.23 1.305 3.745 3.744a.724 .724 0 0 0 .447 1.08c2.775 .673 2.775 4.62 0 5.294a.724 .724 0 0 0 -.448 1.08c1.485 2.439 -1.305 5.23 -3.744 3.745a.724 .724 0 0 0 -1.08 .447c-.673 2.775 -4.62 2.775 -5.294 0a.724 .724 0 0 0 -1.08 -.448c-2.439 1.485 -5.23 -1.305 -3.745 -3.744a.724 .724 0 0 0 -.447 -1.08c-2.775 -.673 -2.775 -4.62 0 -5.294a.724 .724 0 0 0 .448 -1.08c-1.485 -2.439 1.305 -5.23 3.744 -3.745a.722 .722 0 0 0 1.08 -.447c.673 -2.775 4.62 -2.775 5.294 0zm-2.647 4.919a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z">
        </path>
      </svg></button>
    <div class="relative w-10" data-headlessui-state="">
      <div aria-expanded="false" data-headlessui-state="" id="headlessui-popover-button-_r_a_"><button class="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10"><svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z">
            </path>
          </svg></button></div>
    </div>
  </div>
</div>
```

```css
@font-face {
  font-family: DM Sans;
  font-style: normal;
  font-display: swap;
  font-weight: 100;
  src:
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-100-normal-ZwMKEyG7.woff2') format("woff2"),
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-100-normal-CuNerm5Z.woff') format("woff");
}
@font-face {
  font-family: DM Sans;
  font-style: normal;
  font-display: swap;
  font-weight: 200;
  src:
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-200-normal-Db5rW57f.woff2') format("woff2"),
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-200-normal-Bn3cuIU8.woff') format("woff");
}
@font-face {
  font-family: DM Sans;
  font-style: normal;
  font-display: swap;
  font-weight: 300;
  src:
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-300-normal-C46oWILc.woff2') format("woff2"),
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-300-normal-CsNfKS1n.woff') format("woff");
}
@font-face {
  font-family: DM Sans;
  font-style: normal;
  font-display: swap;
  font-weight: 400;
  src:
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-400-normal-CW0RaeGs.woff2') format("woff2"),
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-400-normal-BwCSEQnW.woff') format("woff");
}
@font-face {
  font-family: DM Sans;
  font-style: normal;
  font-display: swap;
  font-weight: 500;
  src:
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-500-normal-B9HHJjqV.woff2') format("woff2"),
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-500-normal-Dr3UlScf.woff') format("woff");
}
@font-face {
  font-family: DM Sans;
  font-style: normal;
  font-display: swap;
  font-weight: 600;
  src:
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-600-normal-Aqo67rzb.woff2') format("woff2"),
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-600-normal-BmdmIIQ2.woff') format("woff");
}
@font-face {
  font-family: DM Sans;
  font-style: normal;
  font-display: swap;
  font-weight: 700;
  src:
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-700-normal-DvUfVpUG.woff2') format("woff2"),
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-700-normal-CUSSCpQX.woff') format("woff");
}
@font-face {
  font-family: DM Sans;
  font-style: normal;
  font-display: swap;
  font-weight: 800;
  src:
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-800-normal-C2H8778U.woff2') format("woff2"),
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-800-normal-BwbkPQqB.woff') format("woff");
}
@font-face {
  font-family: DM Sans;
  font-style: normal;
  font-display: swap;
  font-weight: 900;
  src:
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-900-normal-BmOyECvA.woff2') format("woff2"),
    url('https://proxy.extractcss.dev/https://app.chitchat.gg/assets/dm-sans-latin-900-normal-Bm36EmVp.woff') format("woff");
}

@layer inherited {
  #component,
  #component:before,
  #component:after {
    --tw-shadow: 0 0 #0000;

    --tw-ring-shadow: 0 0 #0000;
    --tw-ring-offset-shadow: 0 0 #0000;
    --tw-ring-color: #3b82f680;
    --tw-ring-offset-color: #fff;
    --tw-ring-offset-width: 0px;
    --tw-ring-inset: ;
    --tw-gradient-to-position: ;
    --tw-gradient-via-position: ;
    --tw-gradient-from-position: ;
  }
  #component::backdrop {
    --tw-shadow: 0 0 #0000;
    --tw-ring-shadow: 0 0 #0000;
    --tw-ring-offset-shadow: 0 0 #0000;
    --tw-ring-color: #3b82f680;
    --tw-ring-offset-color: #fff;
    --tw-ring-offset-width: 0px;
    --tw-ring-inset: ;
    --tw-gradient-to-position: ;
    --tw-gradient-via-position: ;
    --tw-gradient-from-position: ;
  }
  #component {
    font-family:
      DM Sans,
      sans-serif;
    line-height: 1.5;
  }
  #component:disabled {
    cursor: default;
    cursor: default;
    cursor: default;
    cursor: default;
    cursor: default;
    cursor: default;
    cursor: default;
    cursor: default;
  }
  #component {
    --radius: 0.5rem;
    --ring: 264 39% 39%;
    --success: 116 46% 49%;
    --accent-foreground: 264 3.9% 96.95%;
    --accent: 233 6% 24%;
    --primary: 255 42% 50%;
    --border: 220 8% 30%;
    --panel: 230 10% 12%;
    --popover: 232 10% 16%;
    --foreground: 235 10% 80%;
    --background: 234 10% 20%;
    --brightness: 255 100% 100%;
    color: #2e2f38;
  }
}
*,
:before,
:after {
  --tw-gradient-from-position: ;
  --tw-gradient-via-position: ;
  --tw-gradient-to-position: ;
  --tw-ring-inset: ;
  --tw-ring-offset-width: 0px;
  --tw-ring-offset-color: #fff;
  --tw-ring-color: #3b82f680;
  --tw-ring-offset-shadow: 0 0 #0000;
  --tw-ring-shadow: 0 0 #0000;
  --tw-shadow: 0 0 #0000;
}
::backdrop {
  --tw-gradient-from-position: ;
  --tw-gradient-via-position: ;
  --tw-gradient-to-position: ;
  --tw-ring-inset: ;
  --tw-ring-offset-width: 0px;
  --tw-ring-offset-color: #fff;
  --tw-ring-color: #3b82f680;
  --tw-ring-offset-shadow: 0 0 #0000;
  --tw-ring-shadow: 0 0 #0000;
  --tw-shadow: 0 0 #0000;
}
*,
:before,
:after {
  box-sizing: border-box;
  border: 0 solid #e5e7eb;
}
button {
  font-feature-settings: inherit;
  font-variation-settings: inherit;
  font-family: inherit;
  font-size: 100%;
  font-weight: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  color: inherit;
  text-transform: none;
  -webkit-appearance: button;
  background-color: #0000;
  background-image: none;
  padding: 0;
}
button,
p {
  margin: 0;
}
button {
  cursor: pointer;
}
:disabled {
  cursor: default;
}
svg,
img {
  vertical-align: middle;
  display: block;
}
img {
  max-width: 100%;
  height: auto;
}
* {
  scrollbar-color: initial;
  scrollbar-width: initial;
  border-color: #acb0b9;
  border-color: hsl(var(--border));
}
.absolute {
  position: absolute;
}
.relative {
  position: relative;
}
.-top-1\.5 {
  top: -0.375rem;
}
.bottom-0 {
  bottom: 0;
}
.bottom-10 {
  bottom: 2.5rem;
}
.left-0 {
  left: 0;
}
.right-0 {
  right: 0;
}
.z-10 {
  z-index: 10;
}
.mx-auto {
  margin-left: auto;
  margin-right: auto;
}
.my-1\.5 {
  margin-top: 0.375rem;
  margin-bottom: 0.375rem;
}
.mb-\[1px\] {
  margin-bottom: 1px;
}
.mr-2 {
  margin-right: 0.5rem;
}
.mr-\[1px\] {
  margin-right: 1px;
}
.mt-1\.5 {
  margin-top: 0.375rem;
}
.mt-6 {
  margin-top: 1.5rem;
}
.flex {
  display: flex;
}
.inline-flex {
  display: inline-flex;
}
.hidden {
  display: none;
}
.aspect-square {
  aspect-ratio: 1;
}
.h-10 {
  height: 2.5rem;
}
.h-2 {
  height: 0.5rem;
}
.h-5 {
  height: 1.25rem;
}
.h-8 {
  height: 2rem;
}
.h-\[1px\] {
  height: 1px;
}
.h-full {
  height: 100%;
}
.w-10 {
  width: 2.5rem;
}
.w-2 {
  width: 0.5rem;
}
.w-20 {
  width: 5rem;
}
.w-5 {
  width: 1.25rem;
}
.w-56 {
  width: 14rem;
}
.w-8 {
  width: 2rem;
}
.w-full {
  width: 100%;
}
.shrink-0 {
  flex-shrink: 0;
}
.grow {
  flex-grow: 1;
}
.select-text {
  -webkit-user-select: text;
  -moz-user-select: text;
  user-select: text;
}
.flex-row {
  flex-direction: row;
}
.flex-col {
  flex-direction: column;
}
.items-start {
  align-items: flex-start;
}
.items-center {
  align-items: center;
}
.justify-start {
  justify-content: flex-start;
}
.justify-end {
  justify-content: flex-end;
}
.justify-center {
  justify-content: center;
}
.justify-around {
  justify-content: space-around;
}
.gap-0\.5 {
  gap: 0.125rem;
}
.gap-2 {
  gap: 0.5rem;
}
.self-center {
  align-self: center;
}
.overflow-hidden,
.truncate {
  overflow: hidden;
}
.truncate {
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rounded-full {
  border-radius: 9999px;
}
.rounded-lg {
  border-radius: 0.5rem;
  border-radius: var(--radius);
}
.rounded-md {
  border-radius: calc(0.5rem - 2px);
  border-radius: calc(var(--radius) - 2px);
}
.rounded-sm {
  border-radius: calc(0.5rem - 4px);
  border-radius: calc(var(--radius) - 4px);
}
.bg-border {
  background-color: #acb0b9;
  background-color: hsl(var(--border));
}
.bg-gray-900 {
  --tw-bg-opacity: 1;
  background-color: #111827;
  background-color: rgba(17, 24, 39, var(--tw-bg-opacity, 1));
}
.bg-panel {
  background-color: #d5d6dd;
  background-color: hsl(var(--panel));
}
.bg-success {
  background-color: #4bb643;
  background-color: hsl(var(--success));
}
.bg-gradient-to-br {
  background-image: linear-gradient(to bottom right, var(--tw-gradient-stops));
}
.bg-gradient-to-r {
  background-image: linear-gradient(to right, var(--tw-gradient-stops));
}
.bg-gradient-to-tl {
  background-image: linear-gradient(to top left, var(--tw-gradient-stops));
}
.from-\[\#ff8a05\] {
  --tw-gradient-from: #ff8a05 var(--tw-gradient-from-position);
  --tw-gradient-to: #ff8a0500 var(--tw-gradient-to-position);
  --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
}
.from-indigo-700 {
  --tw-gradient-from: #4338ca var(--tw-gradient-from-position);
  --tw-gradient-to: #4338ca00 var(--tw-gradient-to-position);
  --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
}
.from-pink-700 {
  --tw-gradient-from: #be185d var(--tw-gradient-from-position);
  --tw-gradient-to: #be185d00 var(--tw-gradient-to-position);
  --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
}
.via-\[\#ff5478\] {
  --tw-gradient-to: #ff547800 var(--tw-gradient-to-position);
  --tw-gradient-stops: var(--tw-gradient-from), #ff5478 var(--tw-gradient-via-position), var(--tw-gradient-to);
}
.via-red-500 {
  --tw-gradient-to: #ef444400 var(--tw-gradient-to-position);
  --tw-gradient-stops: var(--tw-gradient-from), #ef4444 var(--tw-gradient-via-position), var(--tw-gradient-to);
}
.to-\[\#ff00c6\] {
  --tw-gradient-to: #ff00c6 var(--tw-gradient-to-position);
}
.to-orange-500 {
  --tw-gradient-to: #f97316 var(--tw-gradient-to-position);
}
.to-purple-700 {
  --tw-gradient-to: #7e22ce var(--tw-gradient-to-position);
}
.p-0\.5 {
  padding: 0.125rem;
}
.p-1 {
  padding: 0.25rem;
}
.p-2 {
  padding: 0.5rem;
}
.px-1 {
  padding-left: 0.25rem;
  padding-right: 0.25rem;
}
.px-2 {
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}
.py-1 {
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
}
.py-2 {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}
.pb-1 {
  padding-bottom: 0.25rem;
}
.pb-2 {
  padding-bottom: 0.5rem;
}
.pt-2 {
  padding-top: 0.5rem;
}
.pt-6 {
  padding-top: 1.5rem;
}
.text-center {
  text-align: center;
}
.text-start {
  text-align: left;
}
.text-sm {
  font-size: 0.875rem;
  line-height: 1.25rem;
}
.text-xs {
  font-size: 0.75rem;
  line-height: 1rem;
}
.font-bold {
  font-weight: 700;
}
.font-medium {
  font-weight: 500;
}
.leading-3 {
  line-height: 0.75rem;
}
.leading-4 {
  line-height: 1rem;
}
.text-background {
  color: hsl(var(--background));
}
.text-brightness {
  color: hsl(var(--brightness));
}
.text-white {
  --tw-text-opacity: 1;
  color: rgba(255, 255, 255, var(--tw-text-opacity, 1));
}
.ring-2 {
  --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);
  --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color);
  box-shadow:
    var(--tw-ring-offset-shadow),
    var(--tw-ring-shadow),
    0 0 #0000;
  box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000);
}
.ring-zinc-700 {
  --tw-ring-opacity: 1;
  --tw-ring-color: rgba(63, 63, 70, var(--tw-ring-opacity, 1));
}
.ring-offset-background {
  --tw-ring-offset-color: hsl(var(--background));
}
.transition-all {
  transition-property: all;
  transition-duration: 0.15s;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
.ease-out {
  transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
  animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
}
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
.group:hover .group-hover\:bg-opacity-0 {
  --tw-bg-opacity: 0;
}
.group:hover .group-hover\:from-\[\#ff00c6\] {
  --tw-gradient-from: #ff00c6 var(--tw-gradient-from-position);
  --tw-gradient-to: #ff00c600 var(--tw-gradient-to-position);
  --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
}
.group:hover .group-hover\:via-\[\#ff5478\] {
  --tw-gradient-to: #ff547800 var(--tw-gradient-to-position);
  --tw-gradient-stops: var(--tw-gradient-from), #ff5478 var(--tw-gradient-via-position), var(--tw-gradient-to);
}
.group:hover .group-hover\:to-\[\#ff8a05\] {
  --tw-gradient-to: #ff8a05 var(--tw-gradient-to-position);
}
.hover\:bg-accent:hover {
  background-color: #f5f5f5;
  background-color: hsl(var(--accent));
}
.hover\:bg-primary\/90:hover {
  background-color: #654ab5e6;
  background-color: hsl(var(--primary) / 0.9);
}
.hover\:text-accent-foreground:hover {
  color: hsl(var(--accent-foreground));
}
.focus-visible\:outline-none:focus-visible {
  outline-offset: 2px;
  outline: 2px solid #0000;
}
.focus-visible\:ring-2:focus-visible {
  --tw-ring-offset-shadow: var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color);
  --tw-ring-shadow: var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color);
  box-shadow:
    var(--tw-ring-offset-shadow),
    var(--tw-ring-shadow),
    0 0 #0000;
  box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000);
}
.focus-visible\:ring-ring:focus-visible {
  --tw-ring-color: hsl(var(--ring));
}
.focus-visible\:ring-offset-2:focus-visible {
  --tw-ring-offset-width: 2px;
}
.disabled\:pointer-events-none:disabled {
  pointer-events: none;
}
.disabled\:select-none:disabled {
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
}
.disabled\:opacity-50:disabled {
  opacity: 0.5;
}
#component .dark\:text-foreground {
  color: hsl(var(--foreground));
}
@media (width>=640px) {
  .sm\:flex {
    display: flex;
  }
  .sm\:hidden {
    display: none;
  }
}

```

## Repo-specific steps
1) Detect Tailwind version and config; integrate only nonstandard Tailwind classes (arbitrary JIT, custom tokens).
2) If CSS includes `@layer`, insert the layer statement at the top of global CSS (above Tailwind at-rules) and preserve block order.
3) Emit a minimal test or story (if the repo uses Storybook/Playwright) for the new component.
4) Output a final diff for all touched files.

## Assets

Look closely at the html and css and figure out which assets are used. Make sure to download them via shell and include it in a project aligned way. For fonts, check if the project already uses them. If not, check if we can include them via `next/font/...`, otherwise download them via shell and include them in a project aligned way via font-face, unless stated differently by the user or Next.js isn't used.

You need to ask the user before doing any shell interactions for downloading the assets, so do this as last step! Before you have the permission, use the regular urls provided by the html, no placeholder, just the original urls provided by the html verbatim! This means you also need to allow the urls external host via e.g. next config.