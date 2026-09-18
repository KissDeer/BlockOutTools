"""Cathedral of the Deep inspired traversal whitebox; no third-party dependencies.

Local: python scripts/build_cathedral_whitebox.py --plan-only
Unreal: exec(compile(open(PATH, encoding='utf-8').read(), PATH, 'exec'))
Optional injected globals: ORIGIN=(x,y,z), MATERIALS={role: asset_path}.
All dimensions and route coordinates are centimetres. Floor heights are TOPS.
"""
import json
import math
from pathlib import Path

TARGET_LEVEL = '/Game/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT'
ORIGIN = globals().get('ORIGIN', (0, 0, 0))
MATERIALS = globals().get('MATERIALS', {})
OUTPUT = Path('D:/GameDesgin/BlockOutTools/output/cathedral-of-the-deep/plan.json')


def build_plan():
    actors, routes, stairs = [], [], []

    def box(region, name, center, size, material='Stone', rotation=(0, 0, 0), mesh='Cube'):
        actors.append(dict(label='COTD_' + name, region=region, kind='mesh', mesh=mesh,
                           location=list(center), size=list(size), rotation=list(rotation), material=material))

    def floor(region, name, x, y, z, w, d, material='Floor'):
        box(region, name, (x, y, z - 40), (w, d, 80), material)

    def route(name, points, width, purpose='main'):
        routes.append(dict(name=name, points=points, minimum_width=width, purpose=purpose))

    def steps(region, name, start, end, width=400):
        x1, y1, z1 = start
        x2, y2, z2 = end
        if z2 < z1:
            start, end = end, start
            x1, y1, z1 = start
            x2, y2, z2 = end
        count = math.ceil((z2-z1)/18)
        run = math.hypot(x2-x1, y2-y1)
        rise, tread = (z2-z1)/count, run/count
        assert tread >= 28, (name, tread)
        yaw = math.degrees(math.atan2(y2-y1, x2-x1))
        for i in range(count):
            t = (i+.5)/count
            height = (i+1)*rise + 80
            box(region, f'{name}_Step_{i+1:03}',
                (x1+(x2-x1)*t, y1+(y2-y1)*t, z1-80+height/2),
                (tread+1, width, height), 'StoneWarm', (0, yaw, 0))
        stairs.append(dict(name=name, start=start, end=end, count=count, rise=rise, tread=tread, width=width))
        route(name, [start, end], width)

    def sign(region, name, text, x, y, z, yaw=-90, size=95):
        actors.append(dict(label='COTD_Sign_'+name, region=region, kind='text', text=text,
                           location=[x,y,z], rotation=[0,yaw,0], text_size=size))

    def frame(region, name, x, y, z, width=800, height=700, yaw=0):
        angle = math.radians(yaw)
        for side in [-1, 1]:
            offset = side*(width/2+90)
            box(region, name+('_L' if side<0 else '_R'),
                (x+math.cos(angle)*offset,y+math.sin(angle)*offset,z+height/2),
                (180,220,height),'Stone',(0,yaw,0))
        box(region, name+'_Lintel',(x,y,z+height+110),(width+360,220,220),'Stone',(0,yaw,0))

    def beam(region, name, a, b, width=180, height=90, material='Roof'):
        dx,dy,dz=[b[i]-a[i] for i in range(3)]
        length=math.sqrt(dx*dx+dy*dy+dz*dz)
        pitch=math.degrees(math.atan2(dz,math.hypot(dx,dy)))
        yaw=math.degrees(math.atan2(dy,dx))
        box(region,name,tuple((a[i]+b[i])/2 for i in range(3)),(length,width,height),material,(pitch,yaw,0))

    # Southern refuge: door openings are real geometry, not painted wall markers.
    r='01 Cleansing Chapel'
    floor(r,'Chapel_Floor',0,-7000,0,3200,3000)
    for x in [-1600,1600]:
        box(r,f'Chapel_SideSouth_{x}',(x,-7950,450),(180,1100,900))
        box(r,f'Chapel_SideNorth_{x}',(x,-5950,450),(180,900,900))
    for x in [-1150,1150]:
        box(r,f'Chapel_South_{x}',(x,-8500,450),(900,160,900))
        box(r,f'Chapel_North_{x}',(x,-5500,450),(900,160,900))
    frame(r,'Chapel_Entrance',0,-8500,0,1200,850)
    box(r,'Chapel_NorthClosed',(0,-5500,450),(1400,160,900))
    frame(r,'Shortcut_West',-1600,-7000,0,1000,650,90)
    frame(r,'Shortcut_East',1600,-7000,0,1000,650,90)
    floor(r,'Arrival',0,-9400,0,2600,1800)
    floor(r,'Chapel_AltarDais',0,-5850,0,800,400,'StoneWarm')
    box(r,'Bonfire_Placeholder',(0,-7200,35),(100,100,70),'StoneWarm',mesh='Cylinder')
    sign(r,'Chapel','CLEANSING CHAPEL / SAFE HUB',-1150,-8050,330,size=95)
    sign(r,'ShortcutWest','SHORTCUT 1 / OPEN PROTOTYPE',-1370,-6400,300,0,65)
    sign(r,'ShortcutEast','SHORTCUT 2 / OPEN PROTOTYPE',1370,-6400,300,180,65)
    route('arrival_to_chapel',[(0,-10000,0),(0,-8500,0),(450,-7700,0),(450,-7000,0),(0,-7000,0)],800)

    # Graveyard ascent and east exterior roof promenade.
    r='02 Graveyard and Exterior Ascent'
    floor(r,'Grave_Approach',3350,-7000,0,3500,1000)
    floor(r,'Graveyard',5200,-6400,0,4000,2600,'StoneDark')
    floor(r,'EastStair_Base',7000,-6100,0,900,800)
    for ix in range(5):
        for iy in range(3):
            x,y=3700+ix*630,-5800+iy*350
            box(r,f'Gravestone_{ix}_{iy}',(x,y,105),(95,55,210),'StoneDark',(0,(-1)**ix*12,0))
    steps(r,'Graveyard_Ascent',(7000,-5900,0),(7000,-2500,1800),600)
    floor(r,'Exterior_Landing',7000,-1850,1800,2200,1300,'Roof')
    floor(r,'Buttress_RoofWalk',5800,2650,1800,700,9700,'Roof')
    floor(r,'Roof_Transfer',6400,-1800,1800,1900,800,'Roof')
    for i,y in enumerate([-1200,800,2800,4800,6800]):
        floor(r,f'Buttress_Terrace_{i}',5300,y,1800,1700,950,'Roof')
        box(r,f'Buttress_Pier_{i}',(5050,y,850),(550,700,1700),'StoneDark')
    floor(r,'Upper_Entry_Bridge',4100,6600,1800,4100,900,'Roof')
    frame(r,'Upper_Entry_Portal',4000,6600,1800,1000,900,90)
    sign(r,'Graveyard','GRAVEYARD / ROOF APPROACH',3750,-6900,300,size=90)
    sign(r,'UpperEntry','UPPER CATHEDRAL ENTRANCE',4300,7200,2100,0,80)
    route('chapel_graveyard_ascent',[(0,-7000,0),(3500,-7000,0),(7000,-6400,0),(7000,-5900,0),(7000,-2500,1800),(7000,-1800,1800),(5800,-1800,1800),(5800,6600,1800),(2500,6600,1800)],600)

    # Nave with open roof, giant courts, perimeter galleries and deacon apse.
    r='03 Cathedral Nave'
    floor(r,'Nave_Floor',0,3500,0,8000,10500)
    floor(r,'North_Altar_Arena',0,10000,0,6000,3500,'StoneWarm')
    for x in [-4000,4000]:
        segments = [(-1100,1100),(800,2000),(4300,2600),(8050,1300)] if x<0 else [(-1450,450),(2400,4800),(8050,1300)]
        for i,(y,length) in enumerate(segments):
            box(r,f'Nave_SideWall_{x}_{i}',(x,y,1000),(180,length,2000),'Stone')
    for x in [-2850,2850]:
        box(r,f'Nave_SouthWall_{x}',(x,-1750,750),(2100,180,1500))
    for x in [-3000,3000]:
        box(r,f'Altar_SideWall_{x}',(x,10100,650),(180,3300,1300))
    box(r,'Altar_EndWall',(0,11750,650),(6100,180,1300))
    for side in [-1,1]:
        x=side*2250
        for i,y in enumerate([-200,2000,4200,6400,8400]):
            box(r,f'Column_Base_{side}_{i}',(x,y,90),(600,600,180),'StoneDark')
            box(r,f'Column_Shaft_{side}_{i}',(x,y,1640),(330,330,3100),'Stone')
            box(r,f'Column_Capital_{side}_{i}',(x,y,3250),(550,550,180),'StoneWarm')
    for i,y in enumerate([-200,4200,8400]):
        pts=[(-2250,y,3300),(-1350,y,4000),(0,y,4600),(1350,y,4000),(2250,y,3300)]
        for j in range(4):
            beam(r,f'Pointed_Arch_{i}_{j}',pts[j],pts[j+1],240,260,'Stone')
    for i,(x,y) in enumerate([(-950,2300),(950,5400)]):
        box(r,f'Giant_Court_{i}',(x,y,-5),(1800,2400,30),'StoneDark')
        box(r,f'Giant_Scale_Body_{i}',(x,y,490),(500,500,980),'StoneDark',mesh='Cylinder')
        box(r,f'Giant_Scale_Head_{i}',(x,y,1100),(430,430,340),'StoneWarm')
    # Level dais is purely a material cue: no uncrossable step edge.
    floor(r,'Deacons_Arena_Marker',0,10200,2,4100,2400,'StoneDark')
    box(r,'Deacons_Altar',(0,11100,130),(1700,500,260),'Stone')
    sign(r,'Nave','CATHEDRAL NAVE / GIANT COURTS',-1800,-1000,350,size=115)
    sign(r,'Deacons','DEACONS OF THE DEEP / ARENA',-1950,11400,450,size=115)
    route('nave_altar',[(0,-1750,0),(0,0,0),(0,7500,0),(0,10000,2)],1200)

    r='04 Upper Galleries'
    for side in [-1,1]:
        floor(r,f'Gallery_{side}',side*3350,3400,900,1200,10300)
        # Short parapet segments keep transfer landings and doorway mouths open.
        for i,y in enumerate([2500,4700,7500]):
            box(r,f'Gallery_Rail_{side}_{i}',(side*2750,y,950),(70,1200,100),'StoneDark')
    floor(r,'Gallery_NorthCross',0,8150,900,6500,900)
    floor(r,'Gallery_SouthCross',0,-1350,900,6500,800)
    floor(r,'UpperEntrance_Landing',2500,6550,1800,1200,1100)
    steps(r,'UpperEntrance_Descent',(2500,4000,900),(2500,6000,1800),500)
    floor(r,'UpperDescent_Landing',2950,3800,900,1400,700)
    steps(r,'Gallery_to_Nave',(2500,-1000,0),(2500,1000,900),500)
    floor(r,'NaveStair_GalleryLanding',2925,1300,900,1350,600)
    route('upper_entry_to_nave',[(2500,6600,1800),(2500,6000,1800),(2500,4000,900),(3350,3800,900),(3350,1200,900),(2500,1000,900),(2500,-1000,0),(0,-1000,0)],500)
    route('gallery_circuit',[(-3350,-1350,900),(-3350,8150,900),(3350,8150,900),(3350,-1350,900),(-3350,-1350,900)],800)

    # Return routes are intentionally spatially open shortcut prototypes.
    r='05 Chapel Shortcut Loops'
    floor(r,'West_Return_Aisle',-4900,-2100,0,900,9800,'StoneDark')
    floor(r,'West_Chapel_Link',-3250,-7000,0,3300,1000)
    floor(r,'West_Nave_Link',-4250,2400,0,1700,1000)
    floor(r,'East_Return_Aisle',4700,-3850,0,900,6300,'StoneWarm')
    floor(r,'East_Chapel_Link',3150,-7000,0,3100,1000)
    floor(r,'East_Nave_Link',4225,-700,0,1850,1000)
    frame(r,'West_Return_Portal',-4000,2400,0,1100,850,90)
    frame(r,'East_Return_Portal',4000,-700,0,1100,850,90)
    sign(r,'WestReturn','RETURN 1 / CLEANSING CHAPEL',-4950,1700,350,0,70)
    sign(r,'EastReturn','RETURN 2 / CLEANSING CHAPEL',4650,-1500,350,180,70)
    route('shortcut_west',[(0,3200,0),(-1700,3200,0),(-1700,2400,0),(-4000,2400,0),(-4900,2400,0),(-4900,-7000,0),(-1600,-7000,0),(0,-7000,0)],900,'shortcut_open_prototype')
    route('shortcut_east',[(0,-700,0),(1700,-700,0),(1700,-1300,0),(3350,-1300,0),(3350,-700,0),(4000,-700,0),(4700,-700,0),(4700,-7000,0),(1600,-7000,0),(0,-7000,0)],900,'shortcut_open_prototype')

    # Optional belfry reached from the exterior roof. Rafter deck is deliberately narrow.
    r='06 Belfry Rafters and Rosaria'
    floor(r,'East_NorthRoof_Link',5800,8050,1800,700,2200,'Roof')
    floor(r,'North_RoofCross',0,9100,1800,12300,700,'Roof')
    floor(r,'West_TowerApproach',-5900,7150,1800,700,3900,'Roof')
    floor(r,'Tower_BaseLanding',-6300,5150,1800,1600,800,'Roof')
    steps(r,'Belfry_Stair',(-6500,5350,1800),(-6500,7350,2800),400)
    floor(r,'Belfry_Top',-6500,7900,2800,1800,1100,'Roof')
    for x in [-7400,-5600]:
        for y in [7300,8450]:
            box(r,f'Tower_Pillar_{x}_{y}',(x,y,1700),(250,250,3400),'StoneDark')
    floor(r,'Rafter_Access',-4000,7800,2800,4400,400,'Roof')
    # Crossing decks are flat at the top; diagonal connections overlap at the centre.
    for i,(a,b) in enumerate([((-1800,7800,2755),(1800,2200,2755)),((-1800,2200,2755),(1800,7800,2755)),((-1800,2200,2755),(-1800,7800,2755)),((1800,2200,2755),(1800,7800,2755))]):
        beam(r,f'Rafter_Walk_{i}',a,b,180,90,'Roof')
    floor(r,'Rafter_Access_Inner',-1800,7800,2800,500,500,'Roof')
    # Solid junction pads overlap diagonal beam end faces, retaining collision
    # support at the exact turn points instead of relying on coincident edges.
    for i,(x,y) in enumerate([(1800,2200),(1800,7800),(-1800,2200)]):
        box(r,f'Rafter_Junction_{i}',(x,y,2755),(240,240,90),'Roof')
    floor(r,'Rosaria_Walk',-7700,8200,2800,2400,500,'Roof')
    floor(r,'Rosaria_Chamber',-8800,9400,2800,2600,2800,'StoneWarm')
    for x in [-10100,-7500]:
        box(r,f'Rosaria_Wall_{x}',(x,9550,3250),(160,2500,900))
    box(r,'Rosaria_NorthWall',(-8800,10800,3250),(2600,160,900))
    frame(r,'Rosaria_Portal',-8800,8000,2800,1000,800)
    box(r,'Rosaria_Altar',(-8800,10300,2950),(800,450,300),'Stone')
    sign(r,'Rafters','OPTIONAL RAFTERS / 1.8 m WIDE',-5200,7800,3150,0,75)
    sign(r,'Rosaria','ROSARIA SIDE CHAMBER',-9950,10400,3200,size=85)
    route('roof_to_belfry',[(5800,6600,1800),(5800,9100,1800),(-5900,9100,1800),(-5900,5150,1800),(-6500,5150,1800),(-6500,5350,1800),(-6500,7350,2800),(-6500,7800,2800)],400,'optional')
    route('rafters',[(-6500,7800,2800),(-1800,7800,2800),(1800,2200,2800),(1800,7800,2800),(-1800,2200,2800),(-1800,7800,2800)],180,'optional_fall_risk')
    route('rosaria',[(-6500,7800,2800),(-6500,8200,2800),(-8800,8200,2800),(-8800,9700,2800)],400,'optional')
    # Visual flying buttresses outside the nave, clear of the east roof walkway.
    r='07 Architectural Silhouette'
    for side in [-1,1]:
        for i,y in enumerate([500,3100,5700]):
            beam(r,f'Flying_Buttress_{side}_{i}',(side*4000,y,2600),(side*5100,y,1600),280,280,'Stone')
    sign(r,'Title','CATHEDRAL OF THE DEEP / TRAVERSAL WHITEBOX',-3000,-9900,550,size=130)
    labels=[a['label'] for a in actors]
    assert len(labels)==len(set(labels)), 'Duplicate actor labels'
    assert len(actors)<=700, len(actors)
    return dict(schema='cathedral-whitebox-plan-v1', target_level=TARGET_LEVEL, origin=list(ORIGIN),
                assumptions=['Topology-inspired reconstruction of Dark Souls III Cathedral of the Deep, not an exact surveyed replica.',
                             'No original map imagery or calibrated source scale was supplied; dimensions and cardinal orientation are design assumptions.',
                             'Shortcut doorways are open spatial prototypes; no keys, locks, enemies, bosses, bonfire gameplay or progression state are implemented.',
                             'Giant forms are scale placeholders; architecture is open-roof editable whitebox.',
                             'Rafters are optional 180 cm wide exposed crossings. Runtime traversal and fall recovery require playtesting.'],
                height_strata=[0,900,1800,2800], actors=actors, routes=routes, stairs=stairs,
                regions={'chapel':[0,-7000,0],'graveyard':[5200,-6400,0],'nave':[0,3500,0],
                         'deacons':[0,10000,0],'roof':[5800,3000,1800],'rafters':[0,5000,2800],
                         'rosaria':[-8800,9400,2800]})


def materialize(plan, unreal):
    level_subsystem=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    current_level=level_subsystem.get_current_level()
    current_path=current_level.get_path_name().split(':')[0].split('.')[0]
    if current_path != TARGET_LEVEL:
        raise RuntimeError(f'Refusing to spawn into {current_path}; expected {TARGET_LEVEL}')
    subsystem=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    existing={a.get_actor_label():a for a in subsystem.get_all_level_actors()
              if a.get_actor_label().startswith('COTD_') and a.get_level()==current_level}
    meshes={name:unreal.load_asset('/Engine/BasicShapes/'+name+'.'+name) for name in ['Cube','Cylinder']}
    if not all(meshes.values()):
        raise RuntimeError('Engine basic shape meshes not available')
    materials={}
    for role in ['Floor','Stone','StoneDark','StoneWarm','Roof']:
        path=MATERIALS.get(role, '/Game/MyGame/Map/HighWallofLothric/CathedralWhitebox/Materials/MI_COTD_'+role)
        materials[role]=unreal.load_asset(path)
    made,updated=0,0
    created_paths,updated_paths=[],[]
    for spec in plan['actors']:
        loc=unreal.Vector(*[spec['location'][i]+ORIGIN[i] for i in range(3)])
        pitch,yaw,roll=spec['rotation']
        rot=unreal.Rotator(pitch=pitch,yaw=yaw,roll=roll)
        actor=existing.get(spec['label'])
        cls=unreal.TextRenderActor if spec['kind']=='text' else unreal.StaticMeshActor
        if actor is None:
            actor=subsystem.spawn_actor_from_class(cls,loc,rot)
            if actor is None:
                raise RuntimeError('Failed to spawn '+spec['label'])
            made+=1
            created_paths.append(actor.get_path_name())
        else:
            updated+=1
            updated_paths.append(actor.get_path_name())
        if actor.get_level()!=current_level:
            raise RuntimeError('Actor spawned outside target level: '+spec['label'])
        actor.set_actor_label(spec['label'])
        actor.set_folder_path('COTD/'+spec['region'])
        actor.set_editor_property('tags',[unreal.Name('COTD'),unreal.Name('CathedralWhitebox')])
        actor.set_actor_location_and_rotation(loc,rot,False,False)
        if spec['kind']=='mesh':
            component=actor.static_mesh_component
            component.set_static_mesh(meshes[spec['mesh']])
            actor.set_actor_scale3d(unreal.Vector(*[v/100 for v in spec['size']]))
            component.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS)
            component.set_collision_profile_name('BlockAll')
            if materials.get(spec['material']):
                component.set_material(0,materials[spec['material']])
        else:
            component=actor.get_component_by_class(unreal.TextRenderComponent)
            component.set_text(spec['text'])
            component.set_world_size(spec['text_size'])
            component.set_text_render_color(unreal.Color(r=235,g=225,b=200,a=255))
    result=dict(created=made,updated=updated,total=len(plan['actors']),level=current_path,
                created_actor_paths=created_paths,modified_actor_paths=updated_paths)
    unreal.log('CATHEDRAL_WHITEBOX_RESULT '+json.dumps({k:v for k,v in result.items() if not k.endswith('_paths')}))
    return result


PLAN=build_plan()
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
OUTPUT.write_text(json.dumps(PLAN,ensure_ascii=False,indent=2),encoding='utf-8')
try:
    import unreal
except ImportError:
    unreal=None
if unreal is not None:
    RESULT=materialize(PLAN,unreal)
else:
    print(json.dumps(dict(plan=str(OUTPUT),actors=len(PLAN['actors']),stairs=sum(s['count'] for s in PLAN['stairs']),routes=len(PLAN['routes']))))
