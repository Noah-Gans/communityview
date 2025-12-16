;/*FB_PKG_DELIM*/

__d("getUnboundedScrollPosition",["Scroll"],(function(a,b,c,d,e,f){"use strict";function a(a){if(a===window){var c;return{x:(c=window.pageXOffset)!=null?c:b("Scroll").getLeft(document.documentElement),y:(c=window.pageYOffset)!=null?c:b("Scroll").getTop(document.documentElement)}}return{x:b("Scroll").getLeft(a),y:b("Scroll").getTop(a)}}e.exports=a}),null);