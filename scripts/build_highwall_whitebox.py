"""Generate a reference-informed Lothric High Wall architectural whitebox.

Offline only. Dimensions are centimetres; route Z values denote floor surfaces.
No Unreal imports, dependencies, triggers, elevators, ladders or combat logic.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'output/high-wall-of-lothric/core-plan.json'
TARGET_LEVEL = '/Game/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT2'


def build_plan():
    actors, routes, stairs, samples = [], [], [], []
    nodes = {
        'StartTerrace': (-8500, -9000, 6000, 2600, 2400),
        'DeadDragon': (-2000, -8500, 5400, 3000, 2800),
        'InnerWall': (-2000, -4000, 4500, 2300, 2000),
        'WyvernRampart': (3500, -2500, 4500, 2800, 2100),
        'TowerUpper': (8000, 2000, 5100, 2600, 2600),
        'Roofs': (3500, 6500, 3300, 2300, 2200),
        'Barracks': (-1500, 6500, 2100, 2400, 2500),
        'WingedCourt': (-6000, 6000, 1200, 2900, 3300),
        'ProcessionalWay': (-6000, 12500, 1200, 2600, 2300),
        'DancerChapel': (-6000, 19000, 2400, 4600, 6100),
        'VordtGate': (0, 13500, 0, 3200, 3000),
        'OutsideVista': (5000, 13500, 0, 2300, 3000),
        'SideDeadEnd': (-13000, -9000, 6000, 2000, 1900),
        'Watchtower': (-15500, -5500, 6600, 2200, 2200),
        'GreiratCell': (8000, 6800, 2100, 2200, 2500),
        'ReturnLower': (-11300, 6000, 1200, 1800, 1800),
        'ReturnMiddle': (-11300, -1000, 3600, 1800, 1500),
        'ReturnUpper': (-11300, -7000, 6000, 1800, 1600),
        'WyvernUndercroft': (3500, 1400, 3300, 1800, 1600),
        'BarracksAnnex': (-1500, 10400, 2100, 1900, 1900),
        'ChapelApse': (-6000, 22000, 2400, 2400, 1800),
    }
    serial = {}
    rejected = []

    def add(region, name, center, size, material='Stone', rotation=(0, 0, 0), mesh='Cube', safe=False, collision=True):
        assert all(math.isfinite(v) for v in (*center, *size, *rotation)) and min(size) > 0, name
        label = 'HWL_' + name
        serial[label] = serial.get(label, 0) + 1
        if serial[label] > 1:
            label += '_%03d' % serial[label]
        spec = dict(label=label, region=region, kind='mesh', mesh=mesh, location=list(center),
                    size=list(size), rotation=list(rotation), material=material)
        if not collision:
            spec['collision'] = False
        if safe and collision and obstructs(spec):
            rejected.append(label)
            return
        actors.append(spec)

    def obstructs(spec):
        x, y, z = spec['location']
        sx, sy, sz = spec['size']
        pitch, yaw, roll = map(math.radians, spec['rotation'])
        # Conservative pitch envelope, exact yaw footprint; decorations only.
        hx = (abs(math.cos(pitch))*sx + abs(math.sin(pitch))*sz)/2
        hy = (abs(math.cos(roll))*sy + abs(math.sin(roll))*sz)/2
        hz = (abs(math.cos(pitch))*sz + abs(math.sin(pitch))*sx + abs(math.sin(roll))*sy)/2
        co, si = math.cos(yaw), math.sin(yaw)
        for px, py, pz in samples:
            if z+hz <= pz+3 or z-hz >= pz+260:
                continue
            dx, dy = px-x, py-y
            if abs(dx*co+dy*si) < hx+70 and abs(-dx*si+dy*co) < hy+70:
                return True
        return False

    def floor(region, name, x, y, z, w, d, material='Floor'):
        add(region, name, (x, y, z-100), (w, d, 200), material)

    def route(name, points, width=700, purpose='main'):
        routes.append(dict(name=name, points=[list(p) for p in points], minimum_width=width, purpose=purpose))
        for a, b in zip(points, points[1:]):
            n = max(1, math.ceil(math.dist(a, b)/50))
            samples.extend(tuple(a[k]+(b[k]-a[k])*i/n for k in range(3)) for i in range(n+1))

    def beam(region, name, a, b, width, height, material='Stone', safe=True):
        dx, dy, dz = (b[k]-a[k] for k in range(3))
        add(region, name, [(a[k]+b[k])/2 for k in range(3)],
            (math.dist(a, b), width, height), material,
            (math.degrees(math.atan2(dz, math.hypot(dx, dy))), math.degrees(math.atan2(dy, dx)), 0), safe=safe)

    links = [
        ('StartTerrace','DeadDragon','01_HighWall'), ('DeadDragon','InnerWall','02_InnerWall'),
        ('InnerWall','WyvernRampart','03_WyvernPass'), ('WyvernRampart','TowerUpper','04_TowerAscent'),
        ('TowerUpper','Roofs','05_TowerDescent'), ('Roofs','Barracks','06_RoofDescent'),
        ('Barracks','WingedCourt','07_CourtDescent'), ('WingedCourt','ProcessionalWay','08_Procession'),
        ('ProcessionalWay','DancerChapel','09_ChapelStair'), ('ProcessionalWay','VordtGate','10_VordtDescent'),
        ('VordtGate','OutsideVista','11_Exit'), ('StartTerrace','SideDeadEnd','12_DeadEnd'),
        ('SideDeadEnd','Watchtower','13_Watchtower'), ('Roofs','GreiratCell','14_Greirat'),
        ('WingedCourt','ReturnLower','15_ReturnEntry'), ('ReturnLower','ReturnMiddle','16_ReturnLower'),
        ('ReturnMiddle','ReturnUpper','17_ReturnUpper'), ('ReturnUpper','StartTerrace','18_ReturnHub'),
        ('WyvernRampart','WyvernUndercroft','19_UndercroftDescent'),
        ('WyvernUndercroft','Roofs','20_UndercroftRoof'),
        ('Barracks','BarracksAnnex','21_BarracksSearch'),
        ('DancerChapel','ChapelApse','22_ChapelApse'),
    ]
    corridors = []
    for na, nb, name in links:
        aa, bb = nodes[na], nodes[nb]
        a, b = aa[:3], bb[:3]
        dx, dy = b[0]-a[0], b[1]-a[1]
        length = math.hypot(dx, dy)
        ux, uy = dx/length, dy/length
        da = min(aa[3]/2/abs(ux) if ux else 1e10, aa[4]/2/abs(uy) if uy else 1e10)
        db = min(bb[3]/2/abs(ux) if ux else 1e10, bb[4]/2/abs(uy) if uy else 1e10)
        p, q = (a[0]+ux*da, a[1]+uy*da, a[2]), (b[0]-ux*db, b[1]-uy*db, b[2])
        # The apse overlaps the nave and needs no independent slab/connector.
        if da+db >= length:
            route(name, [a,b], 800, 'optional' if name.startswith('22') else 'main')
            continue
        route(name, [a,p,q,b], 700, 'shortcut_stair_proxy' if 'Return' in name else 'optional' if na in ['SideDeadEnd'] or nb in ['GreiratCell','BarracksAnnex','SideDeadEnd'] else 'main')
        corridors.append((name,p,q,850))

    route('23_Courtyard_Circuit', [(-6900,5100,1200),(-5100,5100,1200),(-5100,6900,1200),(-6900,6900,1200),(-6900,5100,1200)],600,'exploration')
    route('24_Chapel_Nave', [(-6000,17000,2400),(-6000,21000,2400)],1100)
    route('25_Starting_Lookout', [(-8500,-9600,6000),(-7500,-9600,6000),(-7500,-9000,6000),(-8500,-9000,6000)],600,'exploration')

    for name, (x,y,z,w,d) in nodes.items():
        floor(name,name+'_Floor',x,y,z,w,d)
        add(name,name+'_Foundation',(x,y,(z-3500)/2),(w+120,d+120,z+3300),'StoneDark',safe=True)
        for f in [0.25,0.55,0.82]:
            zz = -3200+(z+2900)*f
            add(name,name+'_Foundation_Course',(x,y,zz),(w+190,d+190,90),'StoneWarm',safe=True)

    for name,p,q,width in corridors:
        region='00_ConnectingWalls'
        dx,dy,dz=[q[k]-p[k] for k in range(3)]
        run=math.hypot(dx,dy)
        yaw=math.degrees(math.atan2(dy,dx))
        ux,uy=dx/run,dy/run
        if abs(dz)<1:
            add(region,name+'_Walk',((p[0]+q[0])/2,(p[1]+q[1])/2,p[2]-120),(run+4,width,240),'Floor',(0,yaw,0))
            add(region,name+'_WallMass',((p[0]+q[0])/2,(p[1]+q[1])/2,(p[2]-3500)/2),(run,width-80,p[2]+3260),'StoneDark',(0,yaw,0),safe=True)
        else:
            low,high=(p,q) if dz>0 else (q,p)
            count=math.ceil(abs(dz)/18)
            rise,tread=abs(dz)/count,run/count
            assert tread>=28,(name,tread,run,dz)
            stair_yaw=math.degrees(math.atan2(high[1]-low[1],high[0]-low[0]))
            for i in range(count):
                t=(i+.5)/count
                h=(i+1)*rise+160
                add(region,name+'_Step_%03d'%i,(low[0]+(high[0]-low[0])*t,low[1]+(high[1]-low[1])*t,low[2]-160+h/2),(tread+.4,width,h),'StoneWarm',(0,stair_yaw,0))
            categories={'16_ReturnLower':'large_height','01_HighWall':'narrow_wall','05_TowerDescent':'tower_descent_proxy','09_ChapelStair':'boss_approach'}
            stairs.append(dict(name=name,start=list(low),end=list(high),count=count,rise=rise,tread=tread,width=width,test_category=categories.get(name,'secondary')))
        # Solid side parapets and crenels follow each flight, with open landings.
        for side in [-1,1]:
            offset=side*(width/2+65)
            for i in range(max(1,math.ceil(run/650))):
                t=(i+.5)/max(1,math.ceil(run/650))
                xx,yy,zz=p[0]+dx*t-uy*offset,p[1]+dy*t+ux*offset,p[2]+dz*t
                add(region,name+'_Parapet',(xx,yy,zz+42),(run/max(1,math.ceil(run/650))+2,130,170),'Stone',(0,yaw,0),safe=True)
                add(region,name+'_Merlon',(xx,yy,zz+160),(165,170,180),'Stone',(0,yaw,0),safe=True)

    def arch(region,name,x,y,z,width=1050,spring=850,yaw=0,depth=190):
        co,si=math.cos(math.radians(yaw)),math.sin(math.radians(yaw))
        radius=width/2
        for side in [-1,1]:
            t=side*(radius+100)
            add(region,name+'_Jamb',(x+co*t,y+si*t,z+spring/2),(190,depth,spring),'Trim',(0,yaw,0),safe=True)
            add(region,name+'_Foot',(x+co*t,y+si*t,z+70),(240,depth+70,140),'StoneDark',(0,yaw,0),safe=True)
        for i in range(9):
            th=math.pi*(i+.5)/9
            t=(radius+95)*math.cos(th)
            add(region,name+'_Voussoir',(x+co*t,y+si*t,z+spring+(radius+95)*math.sin(th)),(210,depth,210),'Trim',(math.degrees(th)-90,yaw,0),safe=True)

    def parapet(region,name,x,y,z,w,d):
        for side in [-1,1]:
            for axis,length in [('X',w),('Y',d)]:
                count=max(3,round(length/450))
                for i in range(count):
                    t=-length/2+(i+.5)*length/count
                    xx,yy=(x+t,y+side*d/2) if axis=='X' else (x+side*w/2,y+t)
                    size=(length/count+2,150,160) if axis=='X' else (150,length/count+2,160)
                    add(region,name+'_Coping',(xx,yy,z+40),size,'Stone',safe=True)
                    add(region,name+'_Crenel',(xx,yy,z+190),(170,190,220),'Stone',safe=True)

    def turret(region,name,x,y,z,radius=350,height=1500,spire=True):
        add(region,name+'_Drum',(x,y,z+height/2),(radius*2,radius*2,height),'Stone',mesh='Cylinder',safe=True)
        for h in [0,140,height-260,height-70]:
            add(region,name+'_Ring',(x,y,z+h),(radius*2+100,radius*2+100,100),'Trim',mesh='Cylinder',safe=True)
        if spire:
            add(region,name+'_Spire',(x,y,z+height+650),(radius*2+70,radius*2+70,1450),'Roof',mesh='Cone',safe=True)
            add(region,name+'_Finial',(x,y,z+height+1450),(60,60,210),'Trim',mesh='Cone',safe=True)
        else:
            for i in range(10):
                t=i*math.tau/10
                add(region,name+'_Crown',(x+math.cos(t)*radius,y+math.sin(t)*radius,z+height+100),(140,140,200),'Stone',safe=True)

    for name in ['StartTerrace','DeadDragon','InnerWall','WyvernRampart','Roofs','WingedCourt','ProcessionalWay','OutsideVista','SideDeadEnd','ReturnLower','ReturnMiddle','ReturnUpper']:
        x,y,z,w,d=nodes[name]
        parapet(name,name,x,y,z,w,d)
        for side in ([-1] if name in ['ReturnLower','ReturnMiddle','ReturnUpper','Roofs','OutsideVista'] else [-1,1]):
            for edge in [-1,1]:
                turret(name,name+'_Corner',x+side*w/2,y+edge*d/2,z-1200,230,1400,name not in ['Roofs','OutsideVista'])
        # Recessed facade arcades create legible mass at oblique distant views.
        for i in (range(3) if name in ['StartTerrace','DeadDragon','WyvernRampart','WingedCourt','ProcessionalWay'] else []):
            xx=x-w*.33+i*w*.33
            add(name,name+'_Blind_Recess',(xx,y-d/2-65,z-1250),(w*.15,35,1650),'Recess',safe=True)
            arch(name,name+'_LowerArcade',xx,y-d/2-105,z-2080,w*.15,1100,0,95)

    def house(name,height=2500,roof=True):
        x,y,z,w,d=nodes[name]
        for side in [-1,1]:
            for axis,length in [('X',w),('Y',d)]:
                for sign in [-1,1]:
                    seg=(length-1150)/2
                    t=sign*(575+seg/2)
                    xx,yy=(x+t,y+side*d/2) if axis=='X' else (x+side*w/2,y+t)
                    size=(seg,200,height) if axis=='X' else (200,seg,height)
                    add(name,name+'_Wall',(xx,yy,z+height/2),size,'Stone',safe=True)
                xx,yy=(x,y+side*d/2) if axis=='X' else (x+side*w/2,y)
                size=(length,200,height-1650) if axis=='X' else (200,length,height-1650)
                add(name,name+'_UpperWall',(xx,yy,z+1650+(height-1650)/2),size,'Stone',safe=True)
                arch(name,name+'_Portal',xx,yy,z,1150,900,0 if axis=='X' else 90)
                for h in [250,height-320,height-100]:
                    size=(length+180,300,110) if axis=='X' else (300,length+180,110)
                    add(name,name+'_Stringcourse',(xx,yy,z+h),size,'Trim',safe=True)
        if roof:
            for side in [-1,1]:
                beam(name,name+'_RoofSlope',(x+side*(w/2+180),y,z+height-20),(x,y,z+height+1200),d+360,160,'Roof')
            add(name,name+'_Ridge',(x,y,z+height+1300),(180,d+450,160),'Trim',safe=True)

    for name in ['Barracks','GreiratCell','BarracksAnnex','WyvernUndercroft']:
        house(name,2500)
    for name in ['TowerUpper','Watchtower']:
        x,y,z,w,d=nodes[name]
        house(name,2400,False)
        floor(name,name+'_RoofDeck',x,y,z+2400,w+150,d+150,'Roof')
        parapet(name,name+'_Roof',x,y,z+2400,w+160,d+160)
        for side in [-1,1]:
            for edge in [-1,1]:
                turret(name,name+'_HighTurret',x+side*w/2,y+edge*d/2,z+1800,300,1700,True)
        for side in [-1,1]:
            for i in range(3):
                add(name,name+'_Window',(x+side*(w/2+105),y-650+i*650,z+1950),(30,260,430),'Recess',safe=True)

    # Roof crossing: a horizontal crown is walkable, flanking pitches carry its silhouette.
    x,y,z,w,d=nodes['Roofs']
    for side in [-1,1]:
        beam('Roofs','RoofDistrict_Pitch',(x,y+side*(d/2+1250),z-950),(x,y+side*d/2,z-140),w+350,130,'Roof')
        for i in [-1,0,1]:
            add('Roofs','RoofDistrict_Dormer',(x+i*730,y+side*(d/2+530),z-150),(370,330,750),'Stone',safe=True)
            add('Roofs','RoofDistrict_DormerCap',(x+i*730,y+side*(d/2+530),z+360),(510,470,370),'Roof',mesh='Cone',safe=True)

    # Dancer chapel: complete enclosed basilica, actual central portals and clerestory.
    name='DancerChapel'
    x,y,z,w,d=nodes[name]
    house(name,3500,True)
    for side in [-1,1]:
        for i in range(6):
            yy=y-d/2+420+i*(d-840)/5
            add(name,'Chapel_Buttress',(x+side*(w/2+220),yy,z+1600),(550,330,3200),'Stone',safe=True)
            beam(name,'Chapel_ButtressSlope',(x+side*(w/2+800),yy,z+850),(x+side*(w/2+200),yy,z+2750),300,350,'Stone')
            add(name,'Chapel_TallWindow',(x+side*(w/2+108),yy,z+2300),(35,450,1500),'Recess',safe=True)
            add(name,'Chapel_Column',(x+side*1500,yy,z+1600),(260,260,3200),'Stone',mesh='Cylinder',safe=True)
            add(name,'Chapel_ColumnFoot',(x+side*1500,yy,z+100),(440,440,200),'Trim',safe=True)
            for j in range(6):
                t0=j*math.pi/12
                t1=(j+1)*math.pi/12
                a=(x+side*1500*math.cos(t0),yy,z+3000+1300*math.sin(t0))
                b=(x+side*1500*math.cos(t1),yy,z+3000+1300*math.sin(t1))
                beam(name,'Chapel_Rib',a,b,180,180,'Trim')
    for side in [-1,1]:
        turret(name,'Chapel_FrontSpire',x+side*(w/2-300),y-d/2,z+2700,400,1800,True)
        for i in range(5):
            add(name,'Chapel_Pew',(x+side*900,y-1700+i*700,z+65),(680,230,130),'Wood',safe=True)
            add(name,'Chapel_PewBack',(x+side*900,y-1800+i*700,z+190),(680,65,300),'Wood',safe=True)
    arch(name,'Chapel_GrandPortal',x,y-d/2-200,z,1650,1250,0,340)
    for i in range(18):
        t=math.tau*i/18
        add(name,'Chapel_RoseRim',(x+590*math.cos(t),y-d/2-130,z+2850+590*math.sin(t)),(210,170,190),'Trim',(math.degrees(t),0,0),safe=True)
    for a in range(8):
        t=math.tau*a/8
        beam(name,'Chapel_RoseSpoke',(x,y-d/2-230,z+2850),(x+470*math.cos(t),y-d/2-230,z+2850+470*math.sin(t)),70,70,'Trim')
    add(name,'Chapel_Altar',(-6800,21600,z+160),(700,450,320),'StoneWarm',safe=True)
    house('ChapelApse',3100,True)

    # Vordt gatehouse is a dark covered threshold before the exterior overlook.
    name='VordtGate'
    x,y,z,w,d=nodes[name]
    house(name,2700,False)
    for yy in [y-d/2,y,y+d/2]:
        for i in range(12):
            t=math.pi*(i+.5)/12
            add(name,'Vordt_Vault',(x+1500*math.cos(t),yy,z+1600+950*math.sin(t)),(450,220,180),'Stone',(math.degrees(t)-90,0,0),safe=True)
    add(name,'Vordt_Roof',(x,y,z+2810),(w+400,d+400,260),'StoneDark',safe=True)
    for side in [-1,1]:
        turret(name,'Vordt_GateTower',x+side*(w/2+340),y,z-500,600,4800,True)

    # Portcullis housings remain visibly open; no gate actor or progression logic.
    for name in ['Barracks','TowerUpper','Watchtower','GreiratCell','VordtGate']:
        x,y,z,w,d=nodes[name]
        for i in range(7):
            add(name,name+'_RaisedGrille',(x-480+i*160,y-d/2,z+1930),(35,45,520),'Wood',safe=True)
        for side in [-1,1]:
            add(name,name+'_BannerPole',(x+side*(w/2-300),y-d/2-190,z+1850),(55,60,1200),'Wood',safe=True)
            add(name,name+'_Banner',(x+side*(w/2-300)+140,y-d/2-170,z+1670),(280,35,670),'Cloth',safe=True)

    # The Winged Knight courtyard reads as a circular paved court, with an offset
    # broken fountain that leaves both the axial walk and the perimeter circuit open.
    add('WingedCourt','Court_RadialPaving',(-6000,6000,1202),(2300,2300,4),'StoneWarm',mesh='Cylinder')
    for i in range(24):
        t=math.tau*i/24
        add('WingedCourt','Court_PavingRing',(-6000+1020*math.cos(t),6000+1020*math.sin(t),1206),(265,90,12),'StoneDark',(0,math.degrees(t)+90,0))
    add('WingedCourt','Fountain_Basin',(-6450,6500,1230),(470,470,60),'StoneDark',mesh='Cylinder',safe=True)
    for i in range(12):
        t=math.tau*i/12
        add('WingedCourt','Fountain_Rim',(-6450+235*math.cos(t),6500+235*math.sin(t),1320),(150,100,180),'Trim',(0,math.degrees(t)+90,0),safe=True)
    add('WingedCourt','Fountain_Plinth',(-6450,6500,1400),(160,160,340),'Stone',mesh='Cylinder',safe=True)
    add('WingedCourt','Fountain_BrokenCrown',(-6450,6500,1610),(300,300,110),'StoneWarm',mesh='Cylinder',safe=True)

    labels=[a['label'] for a in actors]
    assert len(labels)==len(set(labels))
    return dict(schema='highwall-whitebox-plan-v1',target_level=TARGET_LEVEL,origin=[0,0,0],
                assumptions=[
                    'Reference-informed DS3 High Wall of Lothric reconstruction, not surveyed or exact 1:1 geometry.',
                    'Reference screenshots establish massive masonry, articulated parapets, round turrets, slate spires and roof districts; scale and orientation are design assumptions.',
                    'Original elevators and ladders are represented by open walkable stair routes; no logic components, combat, bonfire systems, locks or boss encounters.',
                    'Core routes remain wide enough for an editor traversal whitebox; local navigation and gameplay fidelity require actual playtesting.',
                    'Architecture is native primitive geometry; sculptural dragons and distant terrain are supplied by the separate scenery plan.'
                ],height_strata=[0,1200,2100,2400,3300,3600,4500,5100,5400,6000,6600],
                actors=actors,routes=routes,stairs=stairs,regions={n:list(v[:3]) for n,v in nodes.items()},
                region_bounds={n:dict(center=list(v[:3]),size=[v[3],v[4]]) for n,v in nodes.items()},
                player_start=[-8500,-9000,6120],offline_clearance=dict(sample_count=len(samples),removed_decorations=len(rejected),
                method='Decoration only: yaw-oriented box versus sampled centreline, 70cm horizontal buffer and 260cm clear height; UE collision validation remains authoritative.'))


def coarse_verify(plan):
    """Check primitive floor coverage; live Unreal collision is the final authority."""
    pieces=[]
    for a in plan['actors']:
        if not a.get('collision',True) or abs(a['rotation'][0])>.01 or abs(a['rotation'][2])>.01:
            continue
        t=math.radians(a['rotation'][1])
        pieces.append((a,math.cos(t),math.sin(t)))
    unsupported, blocked, count=[],[],0
    for route in plan['routes']:
        for a,b in zip(route['points'],route['points'][1:]):
            n=max(1,math.ceil(math.dist(a,b)/50))
            for i in range(n+1):
                px,py,pz=[a[k]+(b[k]-a[k])*i/n for k in range(3)]
                supported=False
                count+=1
                for s,co,si in pieces:
                    x,y,z=s['location']; sx,sy,sz=s['size']
                    dx,dy=px-x,py-y
                    lx,ly=dx*co+dy*si,-dx*si+dy*co
                    top=z+sz/2
                    if abs(lx)<=sx/2+1 and abs(ly)<=sy/2+1 and abs(top-pz)<30:
                        supported=True
                    if '_Step_' not in s['label'] and top>pz+40 and z-sz/2<pz+245 and abs(lx)<sx/2+34 and abs(ly)<sy/2+34:
                        blocked.append((route['name'],s['label']))
                if not supported:
                    unsupported.append((route['name'],[px,py,pz]))
    result=dict(samples=count,unsupported=unsupported,nonstep_blockers=blocked,
                limits='Flat/yaw primitive approximation only. Stair capsule contacts, tilted objects and engine collision are verified in the editor.')
    assert not unsupported and not blocked,result
    return result


if __name__ == '__main__':
    plan=build_plan()
    plan['offline_geometry_check']=coarse_verify(plan)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(output=str(OUTPUT),actors=len(plan['actors']),routes=len(plan['routes']),stairs=len(plan['stairs']),steps=sum(s['count'] for s in plan['stairs']),offline_clearance=plan['offline_clearance'])))
