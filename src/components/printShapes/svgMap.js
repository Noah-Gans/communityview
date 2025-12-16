// svgMap.js
export const svgMap = {
    pin: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
      <svg viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="none">
        <path
          d="M18 9C18 13.7462 14.2456 18.4924 12.6765 20.2688C12.3109 20.6827 11.6891 20.6827 11.3235 20.2688C9.75444 18.4924 6 13.7462 6 9C6 7 7.5 3 12 3C16.5 3 18 7 18 9Z"
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
        <circle
          cx="12"
          cy="9"
          r="2"
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    ),
  
    triangle: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
      <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none">
        <polygon
          points="50,10 90,90 10,90"
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={strokeWidth}
        />
      </svg>
    ),
  
    airport: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
      <svg viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="none">
        <path
          d="M9.03 21.69L11.36 19.73C11.71 19.43 12.29 19.43 12.64 19.73L14.97 21.69C15.51 21.96 16.17 21.69 16.37 21.11L16.81 19.78C16.92 19.46 16.81 18.99 16.57 18.75L14.3 16.47C14.13 16.31 14 15.99 14 15.76V12.91C14 12.49 14.31 12.29 14.7 12.45L19.61 14.57C20.38 14.9 21.01 14.49 21.01 13.65V12.36C21.01 11.69 20.51 10.92 19.89 10.66L14.3 8.25C14.14 8.18 14 7.97 14 7.79V4.79C14 3.85 13.31 2.74 12.47 2.31C12.17 2.16 11.82 2.16 11.52 2.31C10.68 2.74 9.99 3.86 9.99 4.8V7.8C9.99 7.98 9.85 8.19 9.69 8.26L4.11 10.67C3.49 10.92 2.99 11.69 2.99 12.36V13.65C2.99 14.49 3.62 14.9 4.39 14.57L9.3 12.45C9.68 12.28 10 12.49 10 12.91V15.76C10 15.99 9.87 16.31 9.71 16.47L7.44 18.75C7.2 18.99 7.09 19.45 7.2 19.78L7.64 21.11C7.82 21.69 8.48 21.97 9.03 21.69Z"
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  
    bank: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
      <svg viewBox="0 0 20 20" width="100%" height="100%" preserveAspectRatio="none">
        <path
          d="M9.5 0V1C8.68 1 8 1.68 8 2.5C8 3.32 8.68 4 9.5 4H10.5C10.78 4 11 4.22 11 4.5C11 4.78 10.78 5 10.5 5H8V6H9.5V7H10.5V6C11.32 6 12 5.32 12 4.5C12 3.68 11.32 3 10.5 3H9.5C9.22 3 9 2.78 9 2.5C9 2.22 9.22 2 9.5 2H12V1H10.5V0H9.5ZM7 3.92L0 6.13V6.5V9H1V17H0V20H20V17H19.5H19V9H20V6.13L13 3.92V4.97L19 6.87V8H1V6.87L7 4.97V3.92ZM2 9H3V17H2V9ZM4 9H6V17H4V9ZM7 9H8V17H7V9ZM9 9H11V17H9V9ZM12 9H13V17H12V9ZM14 9H16V17H14V9ZM17 9H18V17H17V9ZM1 18H4H6H9H11H14H16H19V19H1V18Z"
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
        />
      </svg>
    ),
  
    mountain: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
      <svg viewBox="0 0 512 512" width="100%" height="100%" preserveAspectRatio="none">
        <polygon
          points="307.818,99.692 223.69,221.56 172.946,148.056 0,399.173 19.05,412.308 172.98,188.843 
                   209.632,241.941 165.434,305.986 184.492,319.146 223.69,262.347 237.749,241.966 
                   307.718,140.611 492.867,412.275 512,399.239"
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
        />
      </svg>
    ),
    climb1: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 512 512" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M422.835,247.992c-9.548-25.523-38.255-102.093-38.255-102.093c-6.305-16.804-25.025-25.329-41.835-19.026l-27.255,10.213
            l-43.302,7.746l-44.96-43.15c-3.596-3.48-8.371-4.745-12.99-4.251L169.596,5.939c-1.942-4.036-6.797-5.724-10.888-3.75
            c-4.044,1.974-5.73,6.853-3.756,10.896l45.975,94.214c-2.448,6.002-1.238,13.134,3.729,17.895l9.39,9.003l59.605,122.176
            l-14.457,45.857l-20.503-14.033c-7.164-4.902-12.035-12.488-13.501-21.037l-15.824-91.811c-0.587-3.446-1.75-6.765-3.408-9.83
            l-30.755-56.833L147.915,9.482C146.369,3.886,141.278,0,135.464,0H78.729C71.611,0,65.83,5.78,65.83,12.904v463.251
            c0,7.125,5.781,12.902,12.898,12.902h270.157c4.619,0,8.918-2.483,11.208-6.511c2.293-4.02,2.261-8.971-0.096-12.958
            l-46.358-78.469c-1.019-1.72-1.863-3.534-2.546-5.404l-18.068-49.973c5.174-2.953,9.314-7.722,11.256-13.844l0.507-1.654
            l81.129,166.273c1.398,2.899,4.295,4.577,7.32,4.577c1.195,0,2.421-0.262,3.568-0.827c4.043-1.974,5.73-6.853,3.756-10.896
            l-40.752-83.525c0.315,0.016,0.619,0.16,0.955,0.16c1.846,0,3.756-0.214,5.634-0.661c13.15-3.103,21.286-16.277,18.181-29.419
            l-13.722-58.068l43.81-26.474C423.266,276.178,428.655,263.552,422.835,247.992z M248.144,166.936l7.452,7.164
            c3.056,2.945,7.132,4.545,11.304,4.545c0.955,0,1.91-0.088,2.865-0.256l53.747-9.624l20.518,54.758l-34.75-7.172
            c-12.291-2.531-24.486,4.641-28.258,16.604l-0.272,0.835L248.144,166.936z M311.92,297.653l9.107-28.941l14.948,3.088l-5.65,3.422
            c-9.106,5.492-13.597,16.215-11.16,26.546l4.918,20.864L311.92,297.653z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
          <path
            d="M322.633,121.93c20.203,0,36.585-16.38,36.585-36.591c0-20.203-16.382-36.583-36.585-36.583
            c-20.199,0-36.598,16.38-36.598,36.583C286.036,105.55,302.434,121.93,322.633,121.93z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
        </svg>
      ),
      gym: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 1024 1024" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M957.442 547.84h56.32c11.311 0 20.48-9.169 20.48-20.48s-9.169-20.48-20.48-20.48h-56.32c-11.311 0-20.48 9.169-20.48 20.48s9.169 20.48 20.48 20.48zm-630.79 0h389.13c11.311 0 20.48-9.169 20.48-20.48s-9.169-20.48-20.48-20.48h-389.13c-11.311 0-20.48 9.169-20.48 20.48s9.169 20.48 20.48 20.48zm-295.932 0h56.32c11.311 0 20.48-9.169 20.48-20.48s-9.169-20.48-20.48-20.48H30.72c-11.311 0-20.48 9.169-20.48 20.48s9.169 20.48 20.48 20.48z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
          <path
            d="M788.48 788.48c-39.471 0-71.68-32.209-71.68-71.68V337.92c0-39.471 32.209-71.68 71.68-71.68s71.68 32.209 71.68 71.68V716.8c0 39.471-32.209 71.68-71.68 71.68zm0-40.96c16.849 0 30.72-13.871 30.72-30.72V337.92c0-16.849-13.871-30.72-30.72-30.72s-30.72 13.871-30.72 30.72V716.8c0 16.849 13.871 30.72 30.72 30.72z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
          <path
            d="M890.88 650.24c-39.471 0-71.68-32.209-71.68-71.68v-102.4c0-39.471 32.209-71.68 71.68-71.68s71.68 32.209 71.68 71.68v102.4c0 39.471-32.209 71.68-71.68 71.68zm0-40.96c16.849 0 30.72-13.871 30.72-30.72v-102.4c0-16.849-13.871-30.72-30.72-30.72s-30.72 13.871-30.72 30.72v102.4c0 16.849 13.871 30.72 30.72 30.72zM256 747.52c16.849 0 30.72-13.871 30.72-30.72V337.92c0-16.849-13.871-30.72-30.72-30.72s-30.72 13.871-30.72 30.72V716.8c0 16.849 13.871 30.72 30.72 30.72zm0 40.96c-39.471 0-71.68-32.209-71.68-71.68V337.92c0-39.471 32.209-71.68 71.68-71.68s71.68 32.209 71.68 71.68V716.8c0 39.471-32.209 71.68-71.68 71.68z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
          <path
            d="M153.6 609.28c16.849 0 30.72-13.871 30.72-30.72v-102.4c0-16.849-13.871-30.72-30.72-30.72s-30.72 13.871-30.72 30.72v102.4c0 16.849 13.871 30.72 30.72 30.72zm0 40.96c-39.471 0-71.68-32.209-71.68-71.68v-102.4c0-39.471 32.209-71.68 71.68-71.68s71.68 32.209 71.68 71.68v102.4c0 39.471-32.209 71.68-71.68 71.68z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
        </svg>
      ),
      climb2: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 256 256" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M32.2,110c-1.1,2.3-1.9,4.9-2.4,7.6c-0.2,1.4-0.3,2.8-0.3,4.1l1,63.2L8.7,232c-0.8,1.4-1.3,3-1.6,4.7
              c-1.2,7.8,4.1,15,11.9,16.2c6,0.9,11.8-2.1,14.5-7.2l24-51.4c0.5-1.2,0.9-2.4,1.1-3.8c0.1-0.6,0.1-1.3,0.1-1.9l-0.2-39l36.9,16.1
              l6,38.2c1.2,5.6,5.8,10,11.7,11c7.8,1.1,15-4.2,16.2-11.9c0.2-1.3,0.2-2.6,0.1-3.9l-7.3-46.1c-0.9-4.4-3.8-8.3-8-10.2l-33-14.7
              l21-36.5l10.4,13.2c1.1,1.2,2.4,2.2,4,2.8l39.7,11.6c5.3,1.1,10.7-1.6,12.7-6.7c2.3-5.8-0.4-12.3-6.1-14.6
              c-0.2-0.1-0.4-0.1-0.6-0.2l-34.5-10.2l-25.9-31.1c-3.9-4.1-9.1-7.1-15.1-8c-10.5-1.6-20.5,3.4-25.8,12L32.2,110z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
          <path
            d="M146,200.6l-2.5,18.9l-68.2,16.6l0.7,11.7h166.4c5.9,0,10.7-4.8,10.7-10.7l-0.2-224.3L230,7.5l-13.1,59
              L195,75.7l-19.4,54.4l18.5,41.6l-5.2,16L146,200.6z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
          <path
            d="M99.7,45.5c11.7,0,21.2-9.5,21.2-21.2c0-11.7-9.5-21.2-21.2-21.2c-11.7,0-21.2,9.5-21.2,21.2
              C78.4,36,87.9,45.5,99.7,45.5z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
          <path
            d="M57.4,48.8c1.6-2.9,0.7-6.6-2.3-8.3l-10.3-6c-2.9-1.6-6.6-0.7-8.3,2.3L4.8,91.5c-1.6,2.9-0.7,6.6,2.3,8.3
              l10.3,6c2.9,1.7,6.6,0.7,8.3-2.2L57.4,48.8z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
        </svg>
      ),
      hiker: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 128 128" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M63.5,20c5.5,0,10-4.5,10-10c0-5.5-4.5-10-10-10c-5.5,0-10,4.5-10,10C53.5,15.5,58,20,63.5,20z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
          <path
            d="M39.7,50.5l7-28.9c0.4-1.5-0.6-3.1-2.1-3.5l-8.3-2c-1.6-0.4-3.1,0.6-3.5,2.1l-7,28.9c-0.4,1.5,0.6,3.1,2.1,3.5l8.3,2
              C37.7,53,39.3,52.1,39.7,50.5z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
          <path
            d="M104,31.6c-1.1,0-2,0.9-2.3,2L85,124.5c0,0.1,0,0.1,0,0.2c0,1.3,1,2.3,2.3,2.3c1.2,0,2.1-0.9,2.3-2l16.7-90.8v-0.2
              C106.3,32.7,105.3,31.6,104,31.6z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
          <path
            d="M64.4,52.5l1.3-5.8l1,4.6c0.9,3,3.7,3.3,3.7,3.3l16.2,4.1c0.3,0.1,0.6,0.1,1,0.1c2.7,0,4.8-2.1,4.8-4.8
              c0-2.3-1.6-4.2-3.7-4.7l-14.1-3.5L70.8,30c-1.8-8.8-10.2-8.6-10.2-8.6c-8.1-0.2-10.2,8.3-10.2,8.3l-21.1,88.7
              c-0.1,0.5-0.1,0.9-0.1,1.4c0,3.9,3.1,7,7,7c3.2,0,5.9-2.1,6.7-5L55,72l11.5,49.6c0.7,3.1,3.5,5.3,6.8,5.3c3.9,0,7-3.1,7-7
              c0-0.5-0.1-1-0.2-1.5L64.4,52.5z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
        </svg>
      ),
      lake: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 -31.5 1087 1087" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M665.579712 1024c-151.483292 0-290.523313-52.47814-372.080835-140.527803-50.855105-54.912693-75.200634-118.616827-70.196275-184.349756s42.198917-113.477216 90.21371-167.98415c33.272223-37.600317 40.575882-62.892617 36.7888-73.983358-5.004359-13.525294-31.919694-24.480782-46.797517-27.050587-104.550522-0.811518-195.169991-34.354246-243.45529-90.213711a131.060098 131.060098 0 0 1-33.13697-107.390833C42.063664 134.982433 170.959715 61.404834 326.635847 61.404834c158.78695 0 279.703078 76.012152 281.326113 176.640338a139.986792 139.986792 0 0 1-37.329811 97.787875c-29.349888 32.190199-33.948488 54.101176-31.513935 59.105534 0 0 10.955488 23.398758 106.579316 26.103818 230.741514 6.627394 415.497028 122.539163 439.166292 275.510236a228.442214 228.442214 0 0 1-57.482499 187.32532c-75.200634 87.508651-210.588826 140.122045-361.801611 140.122045z m-338.132347-881.984414c-120.10461 0-212.076608 54.101176-219.51552 102.386474a51.125611 51.125611 0 0 0 14.472065 42.198917c31.784441 37.600317 104.415269 61.945846 184.079249 61.945846h6.356889c9.1972 1.487782 89.943204 15.959847 113.206709 81.151764 16.230353 45.174482-1.352529 97.382116-52.342887 155.135121-40.575882 45.715493-67.626469 78.852463-70.196275 120.375115a165.143838 165.143838 0 0 0 48.826311 122.944922c66.544446 71.684058 183.402985 114.559239 312.569541 114.559239s240.344472-42.063664 300.667283-112.395192a151.348039 151.348039 0 0 0 38.952847-121.727645C987.075948 596.059701 831.805574 507.198521 643.127724 501.788403c-100.087175-2.840312-158.651697-27.050588-178.939638-75.606393-17.718135-41.657905-1.487782-93.054022 45.580241-144.585391a59.240787 59.240787 0 0 0 16.771364-42.604676c-0.135253-45.985999-82.504293-96.976357-199.498085-96.976357zM875.762779 154.323603L810.706115 0l-57.482499 154.323603h41.116894V202.879408h40.440629v-48.555805h40.98164zM1029.139612 377.490952l-89.537446-212.211861-78.987716 212.211861h56.400475v66.814952h55.588958v-66.814952h56.535729zM168.525162 675.58843L79.122969 463.511821 0 675.58843h56.535728v66.950204h55.453705v-66.950204h56.535729zM238.450931 945.959054l-72.630828-172.176991-64.109893 172.176991h45.850746v54.101176h45.039229v-54.101176h45.850746zM753.223616 319.196936L693.847576 178.263373 641.234183 319.196936h37.600317v44.498217h36.788799V319.196936h37.600317zM698.716682 899.973055a33.813235 33.813235 0 1 1 0-67.626469c102.521728 0 192.464932-49.773081 192.464932-106.444063a65.462422 65.462422 0 0 0-15.959847-40.575882 33.82676 33.82676 0 1 1 52.883899-42.198917 133.088892 133.088892 0 0 1 30.702417 83.180558c-0.135253 97.11161-114.288733 173.664773-260.091401 173.664773z" 
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
        </svg>
      ),
      
      iceCream: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 32 32" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M21.56,9.54c.25-.65,.38-1.36,.38-2.08,0-3.27-2.66-5.93-5.93-5.93s-5.94,2.66-5.94,5.93c0,.72,.13,1.43,.38,2.08-.59,.45-.95,1.15-.95,1.93,0,1.14,.78,2.08,1.83,2.36l3.94,16.06c.08,.34,.38,.57,.73,.57s.65-.24,.73-.57l3.95-16.06c1.05-.27,1.83-1.22,1.83-2.35,0-.79-.37-1.49-.95-1.93Zm-5.55-6.51c2.44,0,4.43,1.99,4.43,4.43,0,.55-.1,1.08-.29,1.57-.03,0-.06,0-.08,0H11.94s-.06,0-.08,0c-.19-.49-.29-1.02-.29-1.57,0-2.44,1.99-4.43,4.44-4.43Zm0,23.53l-3.11-12.65h6.21l-3.11,12.65Zm4.06-14.15H11.94c-.52,0-.94-.42-.94-.94,0-.41,.26-.76,.68-.9,.07-.03,.16-.04,.26-.04h8.13c.09,0,.18,.02,.3,.06,.38,.12,.64,.47,.64,.88,0,.52-.42,.94-.94,.94Z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
          <circle cx="13.46" cy="6.34" r="1.39" fill={fill} fillOpacity={fillOpacity} />
          <circle cx="16" cy="4.54" r="1.39" fill={fill} fillOpacity={fillOpacity} />
          <circle cx="18.17" cy="6.55" r="1.39" fill={fill} fillOpacity={fillOpacity} />
        </svg>
      ),
      mountains2: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 512 512" width="100%" height="100%" preserveAspectRatio="none">
          <g>
            <path
              d="M510.472,457.703l-105.558-217.23c-5.48-11.275-21.58-11.261-27.053,0c-3.708,7.631-67.15,138.19-71.002,146.117
              c-7.718-13.613-57.916-102.158-65.721-115.922c-5.753-10.148-20.412-10.148-26.164,0l-28.831,50.853
              c-1.701-4.323-49.929-126.865-51.543-130.967c-4.994-12.69-23.002-12.667-27.987,0C104.943,194.801,4.327,450.459,1.057,458.768
              c-3.876,9.845,3.389,20.546,13.993,20.546c15.645,0,459.166,0,481.896,0C508.017,479.314,515.328,467.698,510.472,457.703z
               M228.058,308.577l26.694,47.085l-6.919,3.828l-30.415-27.564c-0.573-0.519-1.175-0.986-1.804-1.401L228.058,308.577z
               M120.609,237.126l23.164,58.856c-4.55,0.817-5.587,2.186-19.741,12.814c-15.235-21.831-15.704-23.863-21.406-25.971
              C109.578,265.153,113.863,254.266,120.609,237.126z M37.131,449.238l48.63-123.564l8.552-6.907l13.964,20.009
              c4.879,6.992,14.569,8.517,21.362,3.42l19.997-15.014l7.159,1.888l10.274,26.105l-53.328,94.064H37.131z M276.42,449.236H148.312
              c4.414-7.784,39.438-69.563,43.864-77.369l13.896-9.634l29.532,26.763c4.763,4.317,11.746,5.13,17.378,2.016l16.604-9.186
              l21.317,37.601C285.507,430.536,288.612,424.146,276.42,449.236z M391.389,281.455l21.948,45.166l-8.516-1.846
              c-6.584-1.431-13.321,1.701-16.476,7.659l-2.231,4.214l-5.492-12.519c-1.338-3.051-3.639-5.542-6.506-7.125L391.389,281.455z
               M309.858,449.239v-0.001c5.074-10.444,40.858-84.083,45.749-94.148l4.502-2.851l10.961,24.984
              c2.317,5.283,7.453,8.775,13.218,8.987c0.185,0.007,0.371,0.01,0.556,0.01c5.552,0,10.675-3.066,13.287-8l11.457-21.635
              c16.334,3.541,12.928,3.128,19.828,3.128l43.504,89.526H309.858z"
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
            />
            <path
              d="M283.084,32.687c-45.941,0-83.316,37.376-83.316,83.316s37.376,83.316,83.316,83.316s83.316-37.376,83.316-83.316
              S329.025,32.687,283.084,32.687z M283.084,169.243c-29.357,0-53.24-23.883-53.24-53.24s23.883-53.24,53.24-53.24
              s53.24,23.883,53.24,53.24S312.44,169.243,283.084,169.243z"
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
            />
          </g>
        </svg>
      ),
      park: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 50 50" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M17.1 26h14.87l-4.893-13h-5.073l-4.904 13zm-8.1-13v-4h32v4h-7.871l4.905 13h11.966v4h-10.137l5.729 14h-5.559l-5.728-14h-18.523l-5.702 14h-5.56l5.697-14h-10.217v-4h12.042l4.901-13h-7.943z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
        </svg>
      ),
      school: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 512 512" width="100%" height="100%" preserveAspectRatio="none">
          <g>
            <path
              d="M330.3835,61.313H269.125V52.562a13.125,13.125,0,0,0-26.25,0V188.16L168.4744,262.563v210H212.66V407.7477c0-24.7034,20.23-46.3092,44.9206-45.4056a43.2983,43.2983,0,0,1,41.7035,43.2843V472.563h44.19v-210L269.125,188.2158V131.313h61.2585A13.1167,13.1167,0,0,0,343.5,118.1987v-43.77A13.1177,13.1177,0,0,0,330.3835,61.313ZM294.0078,282.729c6.3489,50.6629-66.4667,62.0479-76.0669,12.1659C211.5942,244.2342,284.399,232.8523,294.0078,282.729Z"
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
            />
            <rect
              height="131.25"
              width="78.75"
              x="369.75"
              y="341.313"
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
            />
            <path
              d="M466,315.063l-17.5-78.75H354.3734c7.3551,6.8637,16,15.3275,15.3745,26.25l.0021,52.5Z"
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
            />
            <rect
              height="131.25"
              width="78.75"
              x="63.5"
              y="341.313"
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
            />
            <path
              d="M46,315.063h96.25v-52.5c-.63-10.9076,8.03-19.4055,15.3766-26.25H63.5Z"
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeOpacity={strokeOpacity}
              strokeWidth={strokeWidth}
            />
          </g>
        </svg>
      ),
      shop: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 32 32" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M3.16,30.72H28.84c.41,0,.75-.34,.75-.75V8.62c0-.41-.34-.75-.75-.75h-5.83V2.03c0-.41-.34-.75-.75-.75H9.63c-.41,0-.75,.34-.75,.75V7.87H3.16c-.41,0-.75,.34-.75,.75V29.97c0,.41,.34,.75,.75,.75Zm9.67-1.5v-11.38h6.34v11.38h-6.34Zm15.26,0h-7.42v-12.13c0-.41-.34-.75-.75-.75h-7.84c-.41,0-.75,.34-.75,.75v12.13H3.91V13.28H28.09v15.93ZM10.38,2.78h11.13V7.87H10.38V2.78ZM3.91,9.37H28.09v2.41H3.91v-2.41Z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
          {/* Optional: you can leave out the decorative "OPEN" letters for simplicity */}
        </svg>
      ),
      groceryStore: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 -1.02 19.036 19.036" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M379.806,829.36c-.678,1.556-1.213,2.66-2.709,2.66h-8.128a2.664,2.664,0,0,1-2.71-2.66l-.316-5.346v-1.722l-2.911-2.589.7-.708,3.158,2.755h.049v2.264h15.125Zm-12.849-4.382.292,4.382a1.874,1.874,0,0,0,1.72,1.633H377.1c.9,0,1.24-.72,1.626-1.633l1.93-4.382Zm2.017,1.013h8.949v1h-8.949ZM375.952,829h-6.978v-1h6.978Zm-7.478,4a1.5,1.5,0,1,1-1.5,1.5A1.5,1.5,0,0,1,368.474,833Zm-.531,1.969h1V834h-1ZM376.474,833a1.5,1.5,0,1,1-1.5,1.5A1.5,1.5,0,0,1,376.474,833Zm-.531,1.969h1V834h-1Z"
            transform="translate(-363.032 -818.995)"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
        </svg>
      ),
      trailSign: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 512 512" width="100%" height="100%" preserveAspectRatio="none">
          <line x1="256" y1="400" x2="256" y2="464" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          <line x1="256" y1="208" x2="256" y2="272" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          <line x1="256" y1="48" x2="256" y2="80" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M416,208H102.63a16,16,0,0,1-11.32-4.69L32,144,91.31,84.69A16,16,0,0,1,102.63,80H416a16,16,0,0,1,16,16v96A16,16,0,0,1,416,208Z"
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fillOpacity={fillOpacity}
            strokeOpacity={strokeOpacity}
          />
          <path
            d="M96,400H409.37a16,16,0,0,0,11.32-4.69L480,336l-59.31-59.31A16,16,0,0,0,409.37,272H96a16,16,0,0,0-16,16v96A16,16,0,0,0,96,400Z"
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fillOpacity={fillOpacity}
            strokeOpacity={strokeOpacity}
          />
        </svg>
      ),
      trail: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 52 52" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M27.8,2c3.3,0,5.9,2.6,5.9,5.9s-2.7,5.9-5.9,5.9s-5.9-2.6-5.9-5.9S24.5,2,27.8,2z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
          <path
            d="M43,18.1c-1.2-0.1-2.3,0.7-2.4,1.8L40,25.7c-0.2,0-0.3,0.3-0.5,0.3h-5.5l-3.8-6.7c-0.3-0.6-0.9-1.1-1.6-1.2
            l-5.8-0.8c-1-0.1-2,0.4-2.4,1.4l-4.4,11.3c-0.3,0.9,0.1,1.8,0.9,2.3l10.8,7.4l0.9,8.4c0.1,1.1,1.1,1.9,2.2,1.9l0,0
            c1.3,0,2.3-1,2.2-2.2L32,37.5c0-0.5-0.3-1-0.8-1.4l-5.9-6.6l2.2-5.4l2.6,4.5c0.4,0.6,1.1,1.3,1.9,1.3h7.6l-2.2,18
            c-0.1,1.1,0.7,2,1.9,2.1c0.1,0,0.2-0.1,0.2-0.1c1.1,0,2-0.8,2.2-1.9L45,20.2C45.1,19.2,44.2,18.2,43,18.1z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
          <path
            d="M12.2,27.7l3.7-9.5c0.2-0.6,0.5-1.2,0.9-1.8l-0.5-0.1c-3.2-0.4-6.2,1.5-7.2,4.4l-2,5.2
            c-0.4,1.1,0.2,2.4,1.4,2.7l0.9,0.2C10.6,29.3,11.8,28.7,12.2,27.7z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
          <path
            d="M13.6,35.2L9.1,48.6c-0.2,0.7,0.3,1.3,1,1.3h2.5c0.9,0,1.8-0.6,2.1-1.4l4.4-9.7l-5-3.1
            C14,35.5,13.8,35.3,13.6,35.2z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
        </svg>
      ),
      forest: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M8,17h3v4H8a1,1,0,0,0,0,2h8a1,1,0,0,0,0-2H13V17h3a5,5,0,0,0,1-9.9V6A5,5,0,0,0,7,6V7.1A5,5,0,0,0,8,17ZM8,9A1,1,0,0,0,9,8V6a3,3,0,0,1,6,0V8a1,1,0,0,0,1,1,3,3,0,0,1,0,6H13v-.586l2.707-2.707a1,1,0,0,0-1.414-1.414L13,11.586V9a1,1,0,0,0-2,0v2.586L9.707,10.293a1,1,0,0,0-1.414,1.414L11,14.414V15H8A3,3,0,0,1,8,9Z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
        </svg>
      ),
      forest2: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="none">
          <path
            d="M12 17H19L14.5 10.5H17.5L12 3L6.5 10.5H9.5L5 17H12ZM12 17V21"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={strokeOpacity}
          />
        </svg>
      ),
      home: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 16 16" width="100%" height="100%" preserveAspectRatio="none">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8 0L0 6V8H1V15H4V10H7V15H15V8H16V6L14 4.5V1H11V2.25L8 0ZM9 10H12V13H9V10Z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
        </svg>
      ),
      square: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none">
          <rect
            x="10" y="10" width="80" height="80"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
        </svg>
      ),
      diamond: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none">
          <polygon
            points="50,5 95,50 50,95 5,50"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
        </svg>
      ),
      circle: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none">
          <circle
            cx="50" cy="50" r="40"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
        </svg>
      ),
      compass: ({ fill, stroke, strokeWidth, fillOpacity, strokeOpacity }) => (
        <svg viewBox="0 0 24 24" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <path
            d="M12 22.981l4.12-11.49L12 1.149 7.88 11.49zM9.125 12h5.75L12 20.019z"
            fill={fill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
          />
        </svg>
      )
      
    
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
      
  };
  