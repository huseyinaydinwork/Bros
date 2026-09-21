export const CALENDAR={minZoom:.65,maxZoom:1.6,step:.1,width:1064,monthHeight:770,padding:24,radius:24};
export const clampZoom=z=>Math.max(CALENDAR.minZoom,Math.min(CALENDAR.maxZoom,Math.round(z*100)/100));
export const monthOffset=(date,base)=>12*(date.getFullYear()-base.getFullYear())+date.getMonth()-base.getMonth();
export const monthAt=(base,index)=>new Date(base.getFullYear(),base.getMonth()+index,1);
export const visibleMonthIndex=(scrollTop,zoom,count)=>Math.max(0,Math.min(count-1,Math.floor(Math.max(0,scrollTop/zoom-CALENDAR.padding+80)/CALENDAR.monthHeight)));
export const zoomAnchor=(scroll,point,oldZoom,newZoom,max)=>Math.max(0,Math.min(max,(scroll+point)/oldZoom*newZoom-point));
