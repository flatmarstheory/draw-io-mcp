// Native mxGraph shapes keep the diagrams editable without external image assets.
export const shapes = {
  process: 'rounded=1;', rectangle: 'rounded=0;', decision: 'rhombus;perimeter=rhombusPerimeter;',
  terminator: 'rounded=1;arcSize=50;', ellipse: 'ellipse;perimeter=ellipsePerimeter;',
  database: 'shape=cylinder3;boundedLbl=1;size=15;', document: 'shape=document;',
  cloud: 'ellipse;shape=cloud;', actor: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;',
  class: 'swimlane;startSize=32;horizontal=1;fontStyle=1;align=left;',
  entity: 'swimlane;startSize=32;horizontal=1;fontStyle=1;align=left;',
  container: 'swimlane;startSize=32;horizontal=1;container=1;collapsible=0;',
  lane: 'swimlane;startSize=32;horizontal=0;container=1;collapsible=0;',
  text: 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;',
  note: 'shape=note;size=16;fillColor=#fff2cc;strokeColor=#d6b656;',
  component: 'shape=component;align=left;spacingLeft=36;',
  server: 'shape=cube;size=12;', switch: 'rounded=1;arcSize=15;',
  router: 'ellipse;perimeter=ellipsePerimeter;', firewall: 'shape=mxgraph.basic.brick_wall;',
  bpmn_task: 'rounded=1;arcSize=15;',
  bpmn_start: 'ellipse;perimeter=ellipsePerimeter;strokeWidth=1;',
  bpmn_end: 'ellipse;perimeter=ellipsePerimeter;strokeWidth=4;',
  bpmn_gateway: 'rhombus;perimeter=rhombusPerimeter;',
  state: 'rounded=1;arcSize=20;', initial: 'ellipse;perimeter=ellipsePerimeter;fillColor=#222222;',
  final: 'shape=doubleEllipse;perimeter=ellipsePerimeter;fillColor=#222222;',
  package: 'shape=folder;tabWidth=80;tabHeight=20;',
  lifeline: 'shape=umlLifeline;perimeter=lifelinePerimeter;participant=rectangle;',
};
export const relations = {
  arrow: 'endArrow=block;endFill=1;', line: 'endArrow=none;',
  association: 'endArrow=none;', dependency: 'dashed=1;endArrow=open;',
  inheritance: 'endArrow=block;endFill=0;', realization: 'dashed=1;endArrow=block;endFill=0;',
  composition: 'startArrow=diamond;startFill=1;endArrow=none;',
  aggregation: 'startArrow=diamond;startFill=0;endArrow=none;',
  one_to_many: 'startArrow=ERone;endArrow=ERmany;',
  one_to_one: 'startArrow=ERone;endArrow=ERone;',
  many_to_many: 'startArrow=ERmany;endArrow=ERmany;',
  sequence_flow: 'endArrow=block;endFill=1;',
  message_flow: 'dashed=1;startArrow=oval;startFill=0;endArrow=block;endFill=0;',
  return: 'dashed=1;endArrow=open;',
};
const node = (id, label, shape = 'process', extra = {}) => ({ id, label, shape, ...extra });
const edge = (source, target, label = '', relation = 'arrow', extra = {}) => ({ source, target, label, relation, ...extra });
const graph = (name, nodes, edges, layout = 'LR') => ({ name, nodes, edges, layout });
export const templates = {
  flowchart: graph('Approval workflow', [node('start','Start','terminator'),node('review','Review request'),node('decision','Approved?','decision'),node('done','Complete','terminator'),node('revise','Revise request')], [edge('start','review'),edge('review','decision'),edge('decision','done','Yes'),edge('decision','revise','No'),edge('revise','review')]),
  uml_class: graph('UML classes', [node('account','Account','class',{body:['+ id: UUID','+ balance: decimal','+ deposit(amount): void']}),node('savings','SavingsAccount','class',{body:['+ interestRate: decimal','+ accrueInterest(): void']})], [edge('savings','account','','inheritance')], 'TB'),
  uml_use_case: graph('Use cases',[node('user','Customer','actor'),node('browse','Browse products','ellipse'),node('checkout','Checkout','ellipse')],[edge('user','browse','','association'),edge('user','checkout','','association')]),
  uml_sequence: graph('Sequence diagram',[node('client','Client','lifeline',{x:60,y:40,width:140,height:400}),node('api','API','lifeline',{x:340,y:40,width:140,height:400}),node('db','Database','lifeline',{x:620,y:40,width:140,height:400})],[edge('client','api','1. Request','arrow',{style:'exitX=0.5;exitY=0.25;entryX=0.5;entryY=0.25;edgeStyle=none;'}),edge('api','db','2. Query','arrow',{style:'exitX=0.5;exitY=0.45;entryX=0.5;entryY=0.45;edgeStyle=none;'}),edge('db','api','3. Result','return',{style:'exitX=0.5;exitY=0.65;entryX=0.5;entryY=0.65;edgeStyle=none;'}),edge('api','client','4. Response','return',{style:'exitX=0.5;exitY=0.85;entryX=0.5;entryY=0.85;edgeStyle=none;'})], 'manual'),
  erd: graph('Orders ERD',[node('customer','Customer','entity',{body:['PK customer_id: UUID','name: varchar','email: varchar']}),node('order','Order','entity',{body:['PK order_id: UUID','FK customer_id: UUID','total: decimal']}),node('item','OrderItem','entity',{body:['PK item_id: UUID','FK order_id: UUID','quantity: int']})],[edge('customer','order','places','one_to_many'),edge('order','item','contains','one_to_many')]),
  network: graph('Network topology',[node('internet','Internet','cloud'),node('firewall','Firewall','firewall'),node('router','Router','router'),node('switch','Core switch','switch'),node('app','Application server','server'),node('db','Database','database')],[edge('internet','firewall'),edge('firewall','router'),edge('router','switch'),edge('switch','app'),edge('switch','db')]),
  bpmn: graph('Order process (BPMN notation)',[node('start','Start','bpmn_start',{width:40,height:40}),node('receive','Receive order','bpmn_task'),node('check','In stock?','bpmn_gateway',{width:80,height:80}),node('ship','Ship order','bpmn_task'),node('backorder','Backorder','bpmn_task'),node('end','End','bpmn_end',{width:40,height:40})],[edge('start','receive','','sequence_flow'),edge('receive','check','','sequence_flow'),edge('check','ship','Yes','sequence_flow'),edge('check','backorder','No','sequence_flow'),edge('ship','end','','sequence_flow'),edge('backorder','end','','sequence_flow')]),
  cloud: graph('Cloud architecture',[node('users','Users','actor'),node('edge','CDN / DNS','cloud'),node('lb','Load balancer'),node('api','API service','component'),node('queue','Message queue'),node('worker','Worker','component'),node('db','Managed database','database')],[edge('users','edge','HTTPS'),edge('edge','lb'),edge('lb','api'),edge('api','queue'),edge('queue','worker'),edge('api','db'),edge('worker','db')]),
  state_machine: graph('Order lifecycle',[node('initial','','initial',{width:24,height:24}),node('pending','Pending','state'),node('paid','Paid','state'),node('shipped','Shipped','state'),node('final','','final',{width:32,height:32})],[edge('initial','pending'),edge('pending','paid','payment received'),edge('paid','shipped','dispatch'),edge('shipped','final')]),
  mindmap: graph('Mind map',[node('topic','Project'),node('people','People'),node('process','Process'),node('tech','Technology'),node('team','Team'),node('tools','Tools')],[edge('topic','people','','line'),edge('topic','process','','line'),edge('topic','tech','','line'),edge('people','team','','line'),edge('tech','tools','','line')]),
  org_chart: graph('Organization',[node('ceo','CEO'),node('eng','Engineering'),node('ops','Operations'),node('dev','Development'),node('qa','Quality')],[edge('ceo','eng','','line'),edge('ceo','ops','','line'),edge('eng','dev','','line'),edge('eng','qa','','line')],'TB'),
  data_flow: graph('Data flow',[node('source','Source system','rectangle'),node('ingest','Ingest','ellipse'),node('store','Data store','database'),node('transform','Transform','ellipse'),node('report','Report','document')],[edge('source','ingest','events'),edge('ingest','store','raw data'),edge('store','transform'),edge('transform','report')]),
};
