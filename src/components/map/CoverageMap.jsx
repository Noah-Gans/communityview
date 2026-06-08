import { useState } from "react";
import "./CoverageMap.css";

export default function CoverageMap() {
  const [hovered, setHovered] = useState(null);

  return (
    <div className="coverage">
      {/* Title positioned on top of the map */}
      <div className="map-title-overlay">
        <h2 className="coverage-map-title">Our Regions of Operations</h2>
      </div>
      
      <svg xmlns="http://www.w3.org/2000/svg" baseProfile="tiny" width="296.926mm" version="1.2" viewBox="600 200 2500 2000" height="209.973mm">
        <defs/>
        <g fill-rule="evenodd" stroke-linejoin="bevel" stroke="black" stroke-linecap="square" fill="none" stroke-width="1" id="Page">
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(0.999751,0,0,0.999751,0,0)" stroke-width="1"/>
        <g font-weight="400" font-style="normal" stroke="none" font-size="54.1667" font-family=".AppleSystemUIFont" fill-opacity="1" fill="#ffffff" transform="matrix(0.999751,0,0,0.999751,0,0)">
        <path fill-rule="evenodd" vector-effect="none" d="M-2,-2 L3510,-2 L3510,2483 L-2,2483 L-2,-2"/>
        </g>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(0.999751,0,0,0.999751,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        </g>
        <defs/>
        <g fill-rule="evenodd" stroke-linejoin="bevel" stroke="black" stroke-linecap="square" fill="none" stroke-width="1" id="Map 1: Background">
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g font-weight="400" font-style="normal" stroke="none" font-size="54.1667" font-family=".AppleSystemUIFont" fill-opacity="1" fill="#ffffff" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)">
        <path fill-rule="evenodd" vector-effect="none" d="M0,0 L289.697,0 L289.697,203.357 L0,203.357 L0,0"/>
        </g>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        </g>
        <defs/>
        <g fill-rule="evenodd" stroke-linejoin="bevel" stroke="black" stroke-linecap="square" fill="none" stroke-width="1" id="Map 1: cb_2023_us_state_20m">
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g font-weight="400" font-style="normal" stroke="none" font-size="54.1667" font-family=".AppleSystemUIFont" fill-opacity="0" fill="#000000" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)">
        <rect width="3422" x="0" y="0" height="2402"/>
        </g>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#232323" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" fill-opacity="0" stroke-linecap="square" fill="#d5b43c" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)" stroke-width="3.07087">
        <path fill-rule="evenodd" vector-effect="none" d="M-342.2,485.363 L-341.638,485.364 L-336.513,485.37 L-267.582,485.45 L-237.222,485.743 L-204.458,486.06 L-171.025,486.383 L-54.8308,486.632 L-47.0978,496.394 L-39.9214,510.019 L-23.8455,524.935 L-20.7453,527.812 L-7.14711,531.533 L11.6705,543.255 L30.8638,544.172 L46.0683,555.929 L48.0385,569.926 L65.2228,587.355 L54.8084,600.402 L32.1397,633.219 L9.20195,667.334 L4.88564,679.368 L3.52435,683.164 L-12.0224,720.496 L-19.5801,730.116 L-19.7345,730.313 L-35.018,742.535 L-39.5282,756.37 L-32.9798,769.579 L-41.3921,785.068 L-47.7484,793.046 L-59.0258,807.2 L-80.7826,815.25 L-93.643,823.13 L-102.318,843.064 L-115.043,868.21 L-121.479,877.179 L-137.065,888.864 L-134.184,902.721 L-141.601,912.322 L-134.672,920.497 L-128.116,928.864 L-133.367,937.401 L-134.688,939.549 L-122.316,947.367 L-109.234,942.407 L-92.868,953.11 L-69.6805,953.526 L-67.9666,964.55 L-51.3188,968.44 L-49.509,975.118 L-50.0194,975.55 L-71.1114,993.407 L-60.4962,1008.26 L-66.4736,1020.59 L-70.7593,1043.77 L-73.2855,1047.58 L-83.3761,1062.8 L-83.9298,1100.88 L-84.2549,1123.24 L-84.192,1274.71 L-84.0861,1332.46 L-84.1652,1446.26 L-84.0713,1546.73 L-129.601,1546.6 L-184.208,1546.89 L-242.609,1547.1 L-308.87,1547.14 L-342.2,1547.28 L-342.2,485.363"/>
        <path fill-rule="evenodd" vector-effect="none" d="M-141.601,912.322 L-134.184,902.721 L-137.065,888.864 L-121.479,877.179 L-115.043,868.21 L-102.318,843.064 L-93.643,823.13 L-80.7826,815.25 L-59.0258,807.2 L-47.7484,793.046 L-41.3921,785.068 L-32.9798,769.579 L-39.5282,756.37 L-35.018,742.535 L-19.7345,730.313 L-19.5801,730.116 L-12.0224,720.496 L3.52435,683.164 L4.88564,679.368 L9.20195,667.334 L32.1397,633.219 L54.8084,600.402 L65.2228,587.355 L48.0385,569.926 L46.0683,555.929 L30.8638,544.172 L11.6705,543.255 L-7.14711,531.533 L-20.7453,527.812 L-23.8455,524.935 L-39.9214,510.019 L-47.0978,496.394 L-54.8308,486.632 L-61.9061,469.23 L-72.3348,462.885 L-60.0003,447.62 L-56.9452,440.066 L-67.2948,432.435 L-67.6697,418.214 L-76.3937,404.982 L-93.769,391.591 L-86.5515,376.63 L-86.8435,372.361 L-87.6727,360.242 L-87.6745,341.688 L-87.6893,186.327 L-87.69,179.04 L-87.7759,151.304 L-87.8636,122.979 L-88.167,25.0036 L-88.0801,-39.2454 L-88.0557,-57.2896 L-88.0272,-78.3664 L-86.4836,-157.386 L-86.0543,-219.516 L-85.9745,-240.2 L175.153,-240.2 L175.158,-178.429 L175.158,-172.912 L175.213,-127.436 L175.218,-102.57 L175.223,-78.3733 L175.159,-45.2064 L177.968,-41.15 L180.041,-38.1557 L198.827,-18.2018 L214.484,-3.58845 L229.199,3.86627 L231.881,18.1962 L261.49,35.2526 L258.173,46.372 L269.313,54.677 L262.17,67.1835 L263.279,78.7594 L285.126,92.273 L269.672,98.7794 L265.053,109.247 L300.001,122.719 L312.378,136.751 L328.566,144.511 L354.868,149.727 L366.787,152.195 L376.018,164.413 L385.655,173.736 L403.255,185.328 L421.439,203.846 L434.616,214.235 L445.123,227.643 L463.756,237.899 L472.774,242.862 L468.569,255.124 L485.203,270.03 L509.227,278.802 L515.293,289.388 L533.38,289.018 L539.265,291.243 L552.566,296.27 L553.949,310.796 L562.006,312.279 L573.626,314.419 L598.588,313.151 L623.138,307.899 L629.767,311.557 L633.762,313.762 L630.931,332.117 L625.54,350.6 L611.912,353.106 L616.758,376.16 L606.755,382.71 L604.3,402.968 L601.748,412.77 L599.495,422.502 L600.527,439.267 L582.279,440.913 L580.53,452.173 L596.781,459.651 L591.423,477.369 L601.786,488.478 L612.113,495.632 L609.219,508.901 L615.832,516.632 L606.621,523.785 L581.633,528.929 L569.596,543.804 L584.889,559.127 L586.277,573.226 L576.69,578.114 L576.064,589.73 L579.874,595.436 L584.499,602.364 L597.652,606.405 L621.065,620.007 L644.759,623.218 L652.024,608.043 L669.367,605.992 L696.78,590.483 L714.869,577.213 L714.694,566.038 L726.386,564.842 L732.553,569.633 L745.67,579.824 L755.614,585.265 L770.12,590.973 L771.15,611.93 L782.522,623.186 L781.625,637.249 L789.844,648.571 L788.992,664.436 L811.687,688.462 L831.69,716.665 L848.631,724.229 L864.245,735.016 L868.024,748.887 L865.044,763.061 L858.248,774.39 L872.097,792.498 L884.096,794.551 L904.166,804.069 L918.584,797.71 L949.302,813.155 L957.324,828.055 L971.069,849.068 L967.959,862.879 L982.35,878.503 L982.346,890.9 L997.124,905.497 L1015.53,915.15 L1030.11,908.547 L1031.42,907.955 L1029.75,898.659 L1054.45,883.619 L1061.68,882.593 L1089.8,885.779 L1123.93,888.695 L1146.7,897.177 L1154.25,875.742 L1173.55,865.229 L1190.66,871.849 L1216.29,875.827 L1240.43,873.389 L1283.84,866.406 L1300.45,880.287 L1327.96,867.422 L1351.07,868.239 L1365.48,868.747 L1377.07,861.396 L1390.41,835.814 L1393.57,831.488 L1398.38,824.88 L1412.65,815.705 L1414.74,816.748 L1428.93,823.838 L1443.5,838.748 L1455.33,850.654 L1461.35,863.312 L1476.71,873.915 L1482.26,885.078 L1501.81,890.275 L1501.76,916.581 L1501.95,985.589 L1502.28,1020.45 L1502.46,1040.37 L1502.57,1098.88 L1502.77,1148.44 L1502.97,1197.61 L1503.09,1262.18 L1503.12,1276.23 L1503.14,1290.81 L1503.24,1354.97 L1502.72,1410.35 L1502.31,1453.99 L1502.42,1546.28 L1415.54,1546.46 L1389.74,1546.77 L1380.07,1546.78 L1380.07,1546.78 L1315.61,1546.87 L1220.45,1547.33 L1220.42,1547.33 L1207.25,1547.05 L1179.19,1546.43 L1077.55,1546.62 L984.151,1547.17 L983.944,1547.17 L918.055,1547.7 L852.418,1548.47 L767.139,1549.73 L707.771,1548.36 L644.074,1548.23 L644.059,1548.23 L560.109,1548.15 L480.262,1546.72 L443.409,1547.06 L370.243,1547.73 L287.453,1547.38 L222.644,1547.56 L99.9111,1547.42 L22.1233,1547.39 L-81.9504,1546.74 L-84.0713,1546.73 L-84.1652,1446.26 L-84.0861,1332.46 L-84.192,1274.71 L-84.2549,1123.24 L-83.9298,1100.88 L-83.3761,1062.8 L-73.2855,1047.58 L-70.7593,1043.77 L-66.4736,1020.59 L-60.4962,1008.26 L-71.1114,993.407 L-50.0194,975.55 L-49.509,975.118 L-51.3188,968.44 L-67.9666,964.55 L-69.6805,953.526 L-92.868,953.11 L-109.234,942.407 L-122.316,947.367 L-134.688,939.549 L-133.367,937.401 L-128.116,928.864 L-134.672,920.497 L-141.601,912.322"/>
        <path fill-rule="evenodd" vector-effect="none" d="M3359.19,-240.2 L3359.29,-213.416 L3359.43,-176.332 L3359.64,-148.516 L3359.93,-109.279 L3360.35,-44.1916 L3360.35,-44.1872 L3360.39,-37.6692 L3360.8,6.97344 L3360.4,60.0447 L3360.11,114.744 L3360.03,132.019 L3360.03,132.501 L3360.16,186.284 L3359.96,237.635 L3359.96,296.007 L3360.01,315.21 L3360.08,341.913 L3360.1,350.157 L3359.98,399.306 L3359.99,411.103 L3359.99,499.925 L3360.34,516.729 L3360.43,521.311 L3360.75,551.745 L3360.92,602.709 L3360.97,620.519 L3361.34,661.602 L3361.4,694.251 L3361.44,717.573 L3361.66,751.128 L3356.74,751.417 L3100.02,750.658 L3096.58,750.658 L3086.4,750.657 L2881.72,750.63 L2834.81,751.376 L2771.47,752.383 L2771.44,752.383 L2605.6,751.827 L2482.84,750.362 L2334.24,750.326 L2311.47,750.32 L2244.83,750.568 L2177.92,750.817 L2145.87,750.821 L2028.93,750.835 L2018,749.169 L1893.07,750.037 L1833.59,749.96 L1781.44,749.893 L1694.04,750.959 L1593,752.772 L1571.85,749.952 L1503.06,750.378 L1503.04,750.502 L1499.71,786.114 L1500.08,823.607 L1500.12,839.283 L1500.16,850.25 L1501.81,890.275 L1482.26,885.078 L1476.71,873.915 L1461.35,863.312 L1455.33,850.654 L1443.5,838.748 L1428.93,823.838 L1414.74,816.748 L1412.65,815.705 L1398.38,824.88 L1393.57,831.488 L1390.41,835.814 L1377.07,861.396 L1365.48,868.747 L1351.07,868.239 L1327.96,867.422 L1300.45,880.287 L1283.84,866.406 L1240.43,873.389 L1216.29,875.827 L1190.66,871.849 L1173.55,865.229 L1154.25,875.742 L1146.7,897.177 L1123.93,888.695 L1089.8,885.779 L1061.68,882.593 L1054.45,883.619 L1029.75,898.659 L1031.42,907.955 L1030.11,908.547 L1015.53,915.15 L997.124,905.497 L982.346,890.9 L982.35,878.503 L967.959,862.879 L971.069,849.068 L957.324,828.055 L949.302,813.155 L918.584,797.71 L904.166,804.069 L884.096,794.551 L872.097,792.498 L858.248,774.39 L865.044,763.061 L868.024,748.887 L864.245,735.016 L848.631,724.229 L831.69,716.665 L811.687,688.462 L788.992,664.436 L789.844,648.571 L781.625,637.249 L782.522,623.186 L771.15,611.93 L770.12,590.973 L755.614,585.265 L745.67,579.824 L732.553,569.633 L726.386,564.842 L714.694,566.038 L714.869,577.213 L696.78,590.483 L669.367,605.992 L652.024,608.043 L644.759,623.218 L621.065,620.007 L597.652,606.405 L584.499,602.364 L579.874,595.436 L576.064,589.73 L576.69,578.114 L586.277,573.226 L584.889,559.127 L569.596,543.804 L581.633,528.929 L606.621,523.785 L615.832,516.632 L609.219,508.901 L612.113,495.632 L601.786,488.478 L591.423,477.369 L596.781,459.651 L580.53,452.173 L582.279,440.913 L600.527,439.267 L599.495,422.502 L601.748,412.77 L604.3,402.968 L606.755,382.71 L616.758,376.16 L611.912,353.106 L625.54,350.6 L630.931,332.117 L633.762,313.762 L629.767,311.557 L623.138,307.899 L598.588,313.151 L573.626,314.419 L562.006,312.279 L553.949,310.796 L552.566,296.27 L539.265,291.243 L533.38,289.018 L515.293,289.388 L509.227,278.802 L485.203,270.03 L468.569,255.124 L472.774,242.862 L463.756,237.899 L445.123,227.643 L434.616,214.235 L421.439,203.846 L403.255,185.328 L385.655,173.736 L376.018,164.413 L366.787,152.195 L354.868,149.727 L328.566,144.511 L312.378,136.751 L300.001,122.719 L265.053,109.247 L269.672,98.7794 L285.126,92.273 L263.279,78.7594 L262.17,67.1835 L269.313,54.677 L258.173,46.372 L261.49,35.2526 L231.881,18.1962 L229.199,3.86627 L214.484,-3.58845 L198.827,-18.2018 L180.041,-38.1557 L177.968,-41.15 L175.159,-45.2064 L175.223,-78.3733 L175.218,-102.57 L175.213,-127.436 L175.158,-172.912 L175.158,-178.429 L175.153,-240.2 L3359.19,-240.2"/>
        <path fill-rule="evenodd" vector-effect="none" d="M3356.74,751.417 L3361.66,751.128 L3361.44,717.573 L3361.4,694.251 L3361.34,661.602 L3360.97,620.519 L3360.92,602.709 L3360.75,551.745 L3360.43,521.311 L3360.34,516.729 L3359.99,499.925 L3462.05,499.943 L3521.99,499.93 L3579.42,499.952 L3638.63,499.976 L3652.74,499.982 L3669.14,499.989 L3715.67,499.988 L3756.51,500.003 L3764.2,500.01 L3764.2,1281.44 L3692.53,1281.37 L3637.21,1281.31 L3511.04,1281.17 L3503.36,1281.18 L3357.95,1281.22 L3357.75,1204.49 L3357.54,1154.6 L3357.51,1147.83 L3357.45,1133.17 L3357.33,1054.93 L3357.35,978.624 L3357.35,968.197 L3357.35,949.73 L3357.27,864.56 L3357.24,832.628 L3356.74,751.417"/>
        <path fill-rule="evenodd" vector-effect="none" d="M3357.95,1781.65 L3358.13,1738.21 L3358.18,1707.69 L3358.18,1707.67 L3358.08,1662.3 L3358.06,1649.2 L3358.03,1626.87 L3357.98,1577.09 L3358.05,1546.24 L3358.06,1542.37 L3358.04,1480.38 L3357.96,1414.05 L3358.08,1384.38 L3358.1,1379.3 L3357.95,1281.22 L3503.36,1281.18 L3511.04,1281.17 L3637.21,1281.31 L3692.53,1281.37 L3764.2,1281.44 L3764.2,1811.43 L3754.96,1811.43 L3737.92,1811.43 L3729.31,1811.43 L3617.06,1811.42 L3535.89,1811.51 L3485.13,1811.56 L3484.94,1811.56 L3357.92,1811.64 L3357.95,1781.65"/>
        <path fill-rule="evenodd" vector-effect="none" d="M-342.2,2642.2 L-342.2,1547.28 L-308.87,1547.14 L-242.609,1547.1 L-184.208,1546.89 L-129.601,1546.6 L-84.0713,1546.73 L-81.9504,1546.74 L22.1233,1547.39 L99.9111,1547.42 L222.644,1547.56 L287.453,1547.38 L370.243,1547.73 L443.409,1547.06 L480.262,1546.72 L560.109,1548.15 L644.059,1548.23 L644.074,1548.23 L707.771,1548.36 L708.255,1612.02 L708.167,1681.56 L707.845,1756.9 L707.659,1812.04 L707.659,1812.05 L707.299,1884.64 L706.749,1945.79 L706.589,1971.66 L706.538,2046.31 L706.534,2051.36 L706.3,2102.25 L706.164,2131.95 L706.323,2198.66 L706.35,2210.01 L705.813,2341.2 L706.092,2374.84 L705.725,2428.26 L705.535,2455.96 L705.534,2455.97 L705.543,2500.65 L705.539,2541.66 L705.601,2568.51 L705.601,2568.55 L705.666,2639.46 L705.624,2642.2 L-342.2,2642.2"/>
        <path fill-rule="evenodd" vector-effect="none" d="M3764.2,-240.2 L3764.2,500.01 L3756.51,500.003 L3715.67,499.988 L3669.14,499.989 L3652.74,499.982 L3638.63,499.976 L3579.42,499.952 L3521.99,499.93 L3462.05,499.943 L3359.99,499.925 L3359.99,411.103 L3359.98,399.306 L3360.1,350.157 L3360.08,341.913 L3360.01,315.21 L3359.96,296.007 L3359.96,237.635 L3360.16,186.284 L3360.03,132.501 L3360.03,132.019 L3360.11,114.744 L3360.4,60.0447 L3360.8,6.97344 L3360.39,-37.6692 L3360.35,-44.1872 L3360.35,-44.1916 L3359.93,-109.279 L3359.64,-148.516 L3359.43,-176.332 L3359.29,-213.416 L3359.19,-240.2 L3764.2,-240.2"/>
        <path fill-rule="evenodd" vector-effect="none" d="M2029.54,2475.32 L2029.54,2475.31 L2031.78,2309.2 L2031.85,2245.37 L2031.9,2210.6 L2031.95,2167.42 L2032.02,2110.51 L2031.92,2029.36 L2031.98,2018.26 L2032.64,1903.92 L2032.64,1901.54 L2032.59,1858.16 L2032.16,1811.84 L2244.26,1811.99 L2332.41,1811.69 L2478.6,1811.2 L2491.77,1811.26 L2613.13,1811.83 L2756.19,1812.49 L2783.68,1812.62 L2790.85,1812.62 L3033.2,1812.5 L3033.27,1812.5 L3121.75,1812.53 L3145.13,1812.54 L3240.17,1811.54 L3357.92,1811.64 L3484.94,1811.56 L3485.13,1811.56 L3535.89,1811.51 L3617.06,1811.42 L3729.31,1811.43 L3737.92,1811.43 L3754.96,1811.43 L3764.2,1811.43 L3764.2,2642.2 L2034.13,2642.2 L2034.14,2639.53 L2034.36,2567.38 L2034.36,2564.28 L2029.51,2534.89 L2029.54,2475.32"/>
        <path fill-rule="evenodd" vector-effect="none" d="M705.624,2642.2 L705.666,2639.46 L705.601,2568.55 L705.601,2568.51 L705.539,2541.66 L705.543,2500.65 L705.534,2455.97 L705.535,2455.96 L705.725,2428.26 L706.092,2374.84 L705.813,2341.2 L706.35,2210.01 L706.323,2198.66 L706.164,2131.95 L706.3,2102.25 L706.534,2051.36 L706.538,2046.31 L706.589,1971.66 L706.749,1945.79 L707.299,1884.64 L707.659,1812.05 L707.659,1812.04 L707.845,1756.9 L708.167,1681.56 L708.255,1612.02 L707.771,1548.36 L767.139,1549.73 L852.418,1548.47 L918.055,1547.7 L983.944,1547.17 L984.151,1547.17 L1077.55,1546.62 L1179.19,1546.43 L1207.25,1547.05 L1220.42,1547.33 L1220.45,1547.33 L1315.61,1546.87 L1380.07,1546.78 L1380.07,1546.78 L1389.74,1546.77 L1415.54,1546.46 L1502.42,1546.28 L1502.65,1658.17 L1502.65,1661.96 L1502.44,1716.32 L1502.43,1745.26 L1502.41,1812.56 L1548.75,1812.71 L1636.9,1812.99 L1747.85,1812.79 L1767.26,1812.73 L1779.93,1812.7 L1855.63,1812.5 L1978.92,1811.75 L2032.16,1811.84 L2032.59,1858.16 L2032.64,1901.54 L2032.64,1903.92 L2031.98,2018.26 L2031.92,2029.36 L2032.02,2110.51 L2031.95,2167.42 L2031.9,2210.6 L2031.85,2245.37 L2031.78,2309.2 L2029.54,2475.31 L2029.54,2475.32 L2029.51,2534.89 L2034.36,2564.28 L2034.36,2567.38 L2034.14,2639.53 L2034.13,2642.2 L705.624,2642.2"/>
        <path fill-rule="evenodd" vector-effect="none" d="M1499.71,786.114 L1503.04,750.502 L1503.06,750.378 L1571.85,749.952 L1593,752.772 L1694.04,750.959 L1781.44,749.893 L1833.59,749.96 L1893.07,750.037 L2018,749.169 L2028.93,750.835 L2145.87,750.821 L2177.92,750.817 L2244.83,750.568 L2311.47,750.32 L2334.24,750.326 L2482.84,750.362 L2605.6,751.827 L2771.44,752.383 L2771.47,752.383 L2834.81,751.376 L2881.72,750.63 L3086.4,750.657 L3096.58,750.658 L3100.02,750.658 L3356.74,751.417 L3357.24,832.628 L3357.27,864.56 L3357.35,949.73 L3357.35,968.197 L3357.35,978.624 L3357.33,1054.93 L3357.45,1133.17 L3357.51,1147.83 L3357.54,1154.6 L3357.75,1204.49 L3357.95,1281.22 L3358.1,1379.3 L3358.08,1384.38 L3357.96,1414.05 L3358.04,1480.38 L3358.06,1542.37 L3358.05,1546.24 L3357.98,1577.09 L3358.03,1626.87 L3358.06,1649.2 L3358.08,1662.3 L3358.18,1707.67 L3358.18,1707.69 L3358.13,1738.21 L3357.95,1781.65 L3357.92,1811.64 L3240.17,1811.54 L3145.13,1812.54 L3121.75,1812.53 L3033.27,1812.5 L3033.2,1812.5 L2790.85,1812.62 L2783.68,1812.62 L2756.19,1812.49 L2613.13,1811.83 L2491.77,1811.26 L2478.6,1811.2 L2332.41,1811.69 L2244.26,1811.99 L2032.16,1811.84 L1978.92,1811.75 L1855.63,1812.5 L1779.93,1812.7 L1767.26,1812.73 L1747.85,1812.79 L1636.9,1812.99 L1548.75,1812.71 L1502.41,1812.56 L1502.43,1745.26 L1502.44,1716.32 L1502.65,1661.96 L1502.65,1658.17 L1502.42,1546.28 L1502.31,1453.99 L1502.72,1410.35 L1503.24,1354.97"/>
        <path fill-rule="evenodd" vector-effect="none" d="M1614.71,1339.96 L1624.21,1339.96 L1624.12,1247.91 L1626.59,1218.97 L1626.67,1204 L1688.86,1204.12 L1688.8,1181.11 L1764.92,1181.15 L1766.44,1158.06 L1845.2,1158.48 L1845.27,1184.29 L1861.06,1184.23 L1861.65,1211.06 L1872.6,1237.06 L1896.75,1259.21 L1898.83,1278.05 L1912.15,1278.59 L1939.91,1297.51 L1961.77,1319.55 L2010.34,1351.03 L2009.77,1362.49 L2026.12,1362.69 L2027.01,1431.69 L2033.81,1476.74 L1913.67,1476.83 L1765.87,1474.86 L1636.42,1473.07 L1635.97,1427.69 L1623.55,1427.72 L1623.57,1358.3 L1614.7,1358.27 L1614.71,1339.96"/>
        <path fill-rule="evenodd" vector-effect="none" d="M1500.12,839.283 L1602.93,839.275 L1602.92,861.429 L1680.54,861.37 L1701.54,870.698 L1706.76,879.239 L1701.42,901.612 L1719.52,916.867 L1720.8,927.036 L1740.03,938.459 L1750.6,963.158 L1748.5,980.879 L1765.97,980.867 L1766.01,1013.93 L1766.44,1158.06 L1764.92,1181.15 L1688.8,1181.11 L1688.86,1204.12 L1626.67,1204 L1626.59,1218.97 L1564.15,1218.98 L1564.15,1198.08 L1502.97,1197.61 L1502.77,1148.44 L1502.57,1098.88 L1502.46,1040.37 L1502.28,1020.45 L1501.95,985.589 L1501.76,916.581 L1501.81,890.275 L1500.16,850.25 L1500.12,839.283"/>
        <text className="state-label" x="1750" y="1800" text-anchor="middle" dominant-baseline="middle" fill="white" font-weight="bold" font-size="60">WY</text>
        <text className="state-label" x="1600" y="1200" text-anchor="middle" dominant-baseline="middle" fill="white" font-weight="bold" font-size="60">MT</text>
        <text className="state-label" x="1200" y="1400" text-anchor="middle" dominant-baseline="middle" fill="white" font-weight="bold" font-size="60">ID</text>
        <text className="state-label" x="1400" y="1900" text-anchor="middle" dominant-baseline="middle" fill="white" font-weight="bold" font-size="60">UT</text>
        <text className="state-label" x="1800" y="2100" text-anchor="middle" dominant-baseline="middle" fill="white" font-weight="bold" font-size="60">CO</text>
        <text className="state-label" x="2200" y="1400" text-anchor="middle" dominant-baseline="middle" fill="white" font-weight="bold" font-size="60">SD</text>
        <text className="state-label" x="2200" y="1600" text-anchor="middle" dominant-baseline="middle" fill="white" font-weight="bold" font-size="60">NE</text>

        </g>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        </g>
        <defs/>
        <g fill-rule="evenodd" stroke-linejoin="bevel" stroke="black" stroke-linecap="square" fill="none" stroke-width="1" id="Map 1: Dissolved">
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g font-weight="400" font-style="normal" stroke="none" font-size="54.1667" font-family=".AppleSystemUIFont" fill-opacity="0" fill="#000000" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)">
        <rect width="3422" x="0" y="0" height="2402"/>
        </g>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#232323" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" fill-opacity="1" stroke-linecap="square" fill="#e5b636" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)" stroke-width="3.07087">
        <path fill-rule="evenodd" vector-effect="none" d="M1503.24,1354.97 L1503.14,1290.81 L1503.12,1276.23 L1503.09,1262.18 L1502.97,1197.61 L1502.77,1148.44 L1459.73,1137.08 L1450.11,1116.39 L1408.74,1116.35 L1409,1036.51 L1465.12,1034.07 L1502.28,1020.45 L1501.95,985.589 L1501.76,916.581 L1501.81,890.275 L1500.16,850.25 L1500.12,839.283 L1602.93,839.275 L1602.92,861.429 L1680.54,861.37 L1701.54,870.698 L1706.76,879.239 L1701.42,901.612 L1719.52,916.867 L1720.8,927.036 L1740.03,938.459 L1750.6,963.158 L1748.5,980.879 L1765.97,980.867 L1766.01,1013.93 L1782.76,1029.57 L1817.6,1027.2 L1828.79,1047.75 L1821.66,1063.85 L1835.87,1068.26 L1868.77,1056.99 L1875.16,1036.54 L1901.55,1026.31 L1928.08,1034.51 L1962.41,1065.59 L1999.96,1095.86 L1999.91,1116.94 L2062.92,1117.1 L2094.72,1120.79 L2094.72,1128.67 L2126.45,1128.62 L2126.35,1140.16 L2157.9,1140.08 L2157.9,1147.85 L2189.52,1147.88 L2189.52,1155.54 L2221.12,1159.39 L2269.3,1156.51 L2418.18,1156.07 L2418.19,1148.35 L2434.17,1148.35 L2438.91,1155.97 L2442.81,1247.4 L2443.05,1339.36 L2431.88,1339.33 L2432.27,1429.47 L2437.34,1431.45 L2437.4,1477.25 L2406.51,1477.35 L2110.17,1476.95 L2033.81,1476.74 L1913.67,1476.83 L1765.87,1474.86 L1767.39,1658.66 L1757.63,1658.76 L1502.65,1658.17 L1502.42,1546.28 L1502.31,1453.99 L1502.72,1410.35 L1503.24,1354.97"/>
        </g>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        </g>
        <defs/>
        <g fill-rule="evenodd" stroke-linejoin="bevel" stroke="black" stroke-linecap="square" fill="none" stroke-width="1" id="Map 1: cb_2023_us_county_20m">
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g font-weight="400" font-style="normal" stroke="none" font-size="54.1667" font-family=".AppleSystemUIFont" fill-opacity="0" fill="#000000" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)">
        <rect width="3422" x="0" y="0" height="2402"/>
        </g>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#232323" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" fill-opacity="1" stroke-linecap="square" fill="#85b66f" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)" stroke-width="3.07087">
          <path 
            fill-rule="evenodd" 
            vector-effect="none" 
            d="M1409,1036.51 L1465.12,1034.07 L1502.28,1020.45 L1502.46,1040.37 L1502.57,1098.88 L1502.77,1148.44 L1459.73,1137.08 L1450.11,1116.39 L1408.74,1116.35 L1409,1036.51"
            onMouseEnter={() => setHovered("Teton County, ID")}
            onMouseLeave={() => setHovered(null)}
          />
          <path 
            fill-rule="evenodd" 
            vector-effect="none" 
            d="M1766.01,1013.93 L1782.76,1029.57 L1817.6,1027.2 L1828.79,1047.75 L1821.66,1063.85 L1835.87,1068.26 L1868.77,1056.99 L1875.16,1036.54 L1901.55,1026.31 L1928.08,1034.51 L1962.41,1065.59 L1999.96,1095.86 L1999.91,1116.94 L2062.92,1117.1 L2094.72,1120.79 L2094.72,1128.67 L2126.45,1128.62 L2126.35,1140.16 L2157.9,1140.08 L2157.9,1147.85 L2189.52,1147.88 L2189.52,1155.54 L2221.12,1159.39 L2269.3,1156.51 L2418.18,1156.07 L2418.19,1148.35 L2434.17,1148.35 L2438.91,1155.97 L2442.81,1247.4 L2443.05,1339.36 L2431.88,1339.33 L2432.27,1429.47 L2437.34,1431.45 L2437.4,1477.25 L2406.51,1477.35 L2110.17,1476.95 L2033.81,1476.74 L2027.01,1431.69 L2026.12,1362.69 L2009.77,1362.49 L2010.34,1351.03 L1961.77,1319.55 L1939.91,1297.51 L1912.15,1278.59 L1898.83,1278.05 L1896.75,1259.21 L1872.6,1237.06 L1861.65,1211.06 L1861.06,1184.23 L1845.27,1184.29 L1845.2,1158.48 L1766.44,1158.06 L1766.01,1013.93"
            onMouseEnter={() => setHovered("Fremont County")}
            onMouseLeave={() => setHovered(null)}
          />
          <path 
            fill-rule="evenodd" 
            vector-effect="none" 
            d="M1502.31,1453.99 L1502.72,1410.35 L1503.24,1354.97 L1503.14,1290.81 L1503.12,1276.23 L1503.09,1262.18 L1502.97,1197.61 L1564.15,1198.08 L1564.15,1218.98 L1626.59,1218.97 L1624.12,1247.91 L1624.21,1339.96 L1614.71,1339.96 L1614.7,1358.27 L1623.57,1358.3 L1623.55,1427.72 L1635.97,1427.69 L1636.42,1473.07 L1765.87,1474.86 L1767.39,1658.66 L1757.63,1658.76 L1502.65,1658.17 L1502.42,1546.28 L1502.31,1453.99"
            onMouseEnter={() => setHovered("Lincoln County")}
            onMouseLeave={() => setHovered(null)}
          />
          <path 
            fill-rule="evenodd" 
            vector-effect="none" 
            d="M1614.71,1339.96 L1624.21,1339.96 L1624.12,1247.91 L1626.59,1218.97 L1626.67,1204 L1688.86,1204.12 L1688.8,1181.11 L1764.92,1181.15 L1766.44,1158.06 L1845.2,1158.48 L1845.27,1184.29 L1861.06,1184.23 L1861.65,1211.06 L1872.6,1237.06 L1896.75,1259.21 L1898.83,1278.05 L1912.15,1278.59 L1939.91,1297.51 L1961.77,1319.55 L2010.34,1351.03 L2009.77,1362.49 L2026.12,1362.69 L2027.01,1431.69 L2033.81,1476.74 L1913.67,1476.83 L1765.87,1474.86 L1636.42,1473.07 L1635.97,1427.69 L1623.55,1427.72 L1623.57,1358.3 L1614.7,1358.27 L1614.71,1339.96"
            onMouseEnter={() => setHovered("Sublette County")}
            onMouseLeave={() => setHovered(null)}
          />
          <path 
            fill-rule="evenodd" 
            vector-effect="none" 
            d="M1500.12,839.283 L1602.93,839.275 L1602.92,861.429 L1680.54,861.37 L1701.54,870.698 L1706.76,879.239 L1701.42,901.612 L1719.52,916.867 L1720.8,927.036 L1740.03,938.459 L1750.6,963.158 L1748.5,980.879 L1765.97,980.867 L1766.01,1013.93 L1766.44,1158.06 L1764.92,1181.15 L1688.8,1181.11 L1688.86,1204.12 L1626.67,1204 L1626.59,1218.97 L1564.15,1218.98 L1564.15,1198.08 L1502.97,1197.61 L1502.77,1148.44 L1502.57,1098.88 L1502.46,1040.37 L1502.28,1020.45 L1501.95,985.589 L1501.76,916.581 L1501.81,890.275 L1500.16,850.25 L1500.12,839.283"
            onMouseEnter={() => setHovered("Teton County, WY")}
            onMouseLeave={() => setHovered(null)}
          />
        </g>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(11.8081,0,0,11.8081,56.0169,44.8136)" stroke-width="1"/>
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#000000" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" stroke-linecap="square" fill="none" transform="matrix(1,0,0,1,0,0)" stroke-width="1"/>
        </g>
        <defs/>
        {/* Region label - moved up from y="800" to y="400" */}
        <text 
          x="1900" 
          y="700" 
          className="region-label"
          text-anchor="middle"
          dominant-baseline="middle"
        >
          Greater Teton Valley Region
        </text>

        {/* Test label - should be visible */}
        <text x="100" y="100" fill="red" font-size="40">TEST</text>
         {/* State labels - coordinates are in the x and y attributes */}
        <text x="2600" y="1300" fill="white" font-weight="bold" font-size="60">WY</text>
        <text x="900" y="1200" fill="white" font-weight="bold" font-size="60">ID</text>
        <text x="1400" y="2100" fill="white" font-weight="bold" font-size="60">UT</text>
        <text x="2799" y="2100" fill="white" font-weight="bold" font-size="60">CO</text>

        {/* Add hover events to county paths */}
        <g stroke-linejoin="bevel" font-weight="400" font-style="normal" stroke="#232323" font-size="54.1667" stroke-opacity="1" font-family=".AppleSystemUIFont" fill-opacity="1" stroke-linecap="square" fill="#85b66f" transform="matrix(0.999751,0,0,0.999751,56.0169,44.8136)" stroke-width="3.07087">
          <path 
            fill-rule="evenodd" 
            vector-effect="none" 
            d="M1409,1036.51 L1465.12,1034.07 L1502.28,1020.45 L1502.46,1040.37 L1502.57,1098.88 L1502.77,1148.44 L1459.73,1137.08 L1450.11,1116.39 L1408.74,1116.35 L1409,1036.51"
            onMouseEnter={() => setHovered("Teton County, ID")}
            onMouseLeave={() => setHovered(null)}
          />
          <path 
            fill-rule="evenodd" 
            vector-effect="none" 
            d="M1766.01,1013.93 L1782.76,1029.57 L1817.6,1027.2 L1828.79,1047.75 L1821.66,1063.85 L1835.87,1068.26 L1868.77,1056.99 L1875.16,1036.54 L1901.55,1026.31 L1928.08,1034.51 L1962.41,1065.59 L1999.96,1095.86 L1999.91,1116.94 L2062.92,1117.1 L2094.72,1120.79 L2094.72,1128.67 L2126.45,1128.62 L2126.35,1140.16 L2157.9,1140.08 L2157.9,1147.85 L2189.52,1147.88 L2189.52,1155.54 L2221.12,1159.39 L2269.3,1156.51 L2418.18,1156.07 L2418.19,1148.35 L2434.17,1148.35 L2438.91,1155.97 L2442.81,1247.4 L2443.05,1339.36 L2431.88,1339.33 L2432.27,1429.47 L2437.34,1431.45 L2437.4,1477.25 L2406.51,1477.35 L2110.17,1476.95 L2033.81,1476.74 L2027.01,1431.69 L2026.12,1362.69 L2009.77,1362.49 L2010.34,1351.03 L1961.77,1319.55 L1939.91,1297.51 L1912.15,1278.59 L1898.83,1278.05 L1896.75,1259.21 L1872.6,1237.06 L1861.65,1211.06 L1861.06,1184.23 L1845.27,1184.29 L1845.2,1158.48 L1766.44,1158.06 L1766.01,1013.93"
            onMouseEnter={() => setHovered("Fremont County")}
            onMouseLeave={() => setHovered(null)}
          />
          <path 
            fill-rule="evenodd" 
            vector-effect="none" 
            d="M1502.31,1453.99 L1502.72,1410.35 L1503.24,1354.97 L1503.14,1290.81 L1503.12,1276.23 L1503.09,1262.18 L1502.97,1197.61 L1564.15,1198.08 L1564.15,1218.98 L1626.59,1218.97 L1624.12,1247.91 L1624.21,1339.96 L1614.71,1339.96 L1614.7,1358.27 L1623.57,1358.3 L1623.55,1427.72 L1635.97,1427.69 L1636.42,1473.07 L1765.87,1474.86 L1767.39,1658.66 L1757.63,1658.76 L1502.65,1658.17 L1502.42,1546.28 L1502.31,1453.99"
            onMouseEnter={() => setHovered("Lincoln County")}
            onMouseLeave={() => setHovered(null)}
          />
          <path 
            fill-rule="evenodd" 
            vector-effect="none" 
            d="M1614.71,1339.96 L1624.21,1339.96 L1624.12,1247.91 L1626.59,1218.97 L1626.67,1204 L1688.86,1204.12 L1688.8,1181.11 L1764.92,1181.15 L1766.44,1158.06 L1845.2,1158.48 L1845.27,1184.29 L1861.06,1184.23 L1861.65,1211.06 L1872.6,1237.06 L1896.75,1259.21 L1898.83,1278.05 L1912.15,1278.59 L1939.91,1297.51 L1961.77,1319.55 L2010.34,1351.03 L2009.77,1362.49 L2026.12,1362.69 L2027.01,1431.69 L2033.81,1476.74 L1913.67,1476.83 L1765.87,1474.86 L1636.42,1473.07 L1635.97,1427.69 L1623.55,1427.72 L1623.57,1358.3 L1614.7,1358.27 L1614.71,1339.96"
            onMouseEnter={() => setHovered("Sublette County")}
            onMouseLeave={() => setHovered(null)}
          />
          <path 
            fill-rule="evenodd" 
            vector-effect="none" 
            d="M1500.12,839.283 L1602.93,839.275 L1602.92,861.429 L1680.54,861.37 L1701.54,870.698 L1706.76,879.239 L1701.42,901.612 L1719.52,916.867 L1720.8,927.036 L1740.03,938.459 L1750.6,963.158 L1748.5,980.879 L1765.97,980.867 L1766.01,1013.93 L1766.44,1158.06 L1764.92,1181.15 L1688.8,1181.11 L1688.86,1204.12 L1626.67,1204 L1626.59,1218.97 L1564.15,1218.98 L1564.15,1198.08 L1502.97,1197.61 L1502.77,1148.44 L1502.57,1098.88 L1502.46,1040.37 L1502.28,1020.45 L1501.95,985.589 L1501.76,916.581 L1501.81,890.275 L1500.16,850.25 L1500.12,839.283"
            onMouseEnter={() => setHovered("Teton County, WY")}
            onMouseLeave={() => setHovered(null)}
          />
        </g>

        {/* County labels that appear on hover - positioned near their respective counties */}
        {hovered && (
          <>
            {/* Background rectangle for the label - dynamically sized */}
            <rect
              x={
                hovered === "Teton County, ID" ? "1300" :
                hovered === "Fremont County" ? "2000" :
                hovered === "Lincoln County" ? "1400" :
                hovered === "Sublette County" ? "1650" :
                hovered === "Teton County, WY" ? "1500" : "1250"
              }
              y={
                hovered === "Teton County, ID" ? "965" :
                hovered === "Fremont County" ? "1010" :
                hovered === "Lincoln County" ? "1180" :
                hovered === "Sublette County" ? "1110" :
                hovered === "Teton County, WY" ? "785" : "580"
              }
              width={
                hovered === "Teton County, ID" ? "400" :
                hovered === "Fremont County" ? "400" :
                hovered === "Lincoln County" ? "400" :
                hovered === "Sublette County" ? "400" :
                hovered === "Teton County, WY" ? "400" : "400"
              }
              height="70"
              fill="rgb(0, 0, 0)"
              stroke="rgba(255, 255, 255, 0.3)"
              stroke-width="2"
              rx="6"
              ry="6"
            />
            <text 
              className="county-label show"
              x={
                hovered === "Teton County, ID" ? "1500" :
                hovered === "Fremont County" ? "2200" :
                hovered === "Lincoln County" ? "1600" :
                hovered === "Sublette County" ? "1850" :
                hovered === "Teton County, WY" ? "1700" : "1550"
              }
              y={
                hovered === "Teton County, ID" ? "1000" :
                hovered === "Fremont County" ? "1050" :
                hovered === "Lincoln County" ? "1220" :
                hovered === "Sublette County" ? "1150" :
                hovered === "Teton County, WY" ? "830" : "600"
              }
              text-anchor="middle"
              dominant-baseline="middle"
            >
              {hovered}
            </text>
          </>
        )}

        {/* Transform origin markers - small dots to show where scaling centers are */}
      </svg>
    </div>
  );
}
