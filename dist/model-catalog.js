// 资产库每种物品仅提供一份；原始版本和来源文件仍保留在素材目录。
function model(id,name,category,directory,targetSize,categoryId='generic',rotationDeg){
 return {id,name,category,path:`/models/${directory}/base_basic_pbr.glb`,options:{name,targetSize,categoryId,...(rotationDeg?{rotationDeg}:{})}};
}
export const MODEL_ASSETS=[
 model('keyboard-pbr','键盘','数码外设','02-数码外设/键盘',32,'keyboard',[-90,0,0]),
 {id:'monitor',name:'显示器',category:'数码外设',path:'/assets/monitor-real.glb',previewDirection:[-1,.6,-1.2],previewExposure:.65,options:{name:'显示器',targetSize:53.9,dimensions:[53.9,40.7,16.3],calibrated:false,categoryId:'monitor',icon:'monitor'}},
 model('headphones-pbr','耳机','数码外设','02-数码外设/耳机',22),
 model('laptop-pbr','笔记本','数码外设','02-数码外设/笔记本',36),
 model('camera-pbr','相机','数码外设','02-数码外设/相机',24),
 model('monitor-arm-pbr','显示器支架','数码外设','02-数码外设/显示器支架',45),
 model('controller-pbr','手柄','数码外设','02-数码外设/手柄',16),
 model('phone-pbr','手机','数码外设','02-数码外设/手机',15.5,'phone'),
 model('mouse-legacy-pbr','鼠标','数码外设','02-数码外设/鼠标/旧目录版本-待核对',12,'mouse'),
 model('cup-pbr','杯子','生活摆件','04-生活摆件/杯子',27,'cup'),
 model('book-pbr','假书','生活摆件','04-生活摆件/假书',26,'book'),
 model('ornament-pbr','小摆件','生活摆件','04-生活摆件/小摆件',18),
 model('figurine-pbr','手办','生活摆件','04-生活摆件/手办',20),
 model('iced-tea','冰红茶','生活摆件','02-数码外设/鼠标/压缩包版本',12),
 {id:'floor-lamp',name:'立灯',category:'照明',path:'/models/03-照明/立灯/立灯.glb',options:{name:'立灯',targetSize:40,categoryId:'lamp'}},
 {id:'light-strip',name:'灯带',category:'照明',path:'/models/03-照明/灯带/灯带.glb',options:{name:'灯带',targetSize:50,categoryId:'generic'}},
 {id:'desk-fixed',name:'固定桌柜',category:'家具',path:'/models/01-家具/桌柜/固定资产-桌柜.glb',fixed:true,options:{name:'固定桌柜'}}
].map(asset=>({
 ...asset,
 sizeLabel:asset.fixed?'默认场景固定资产':asset.options.dimensions?`参考 ${asset.options.dimensions.join(' × ')} cm`:`参考最长边 ${asset.options.targetSize} cm`,
 sizeNote:asset.fixed?'默认场景已提供桌柜，不重复添加。':asset.options.dimensions?'采用默认显示器规格参考，非新实测；导入后可校准。':'参考预设，非实测；保持原始比例，导入后可校准尺寸。'
}));
