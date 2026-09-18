"""Reference-based High Wall scenery manifest. Pure data; does not touch UE."""
import json
import math
import random
from pathlib import Path

ROOT = Path('D:/GameDesgin/BlockOutTools')
OUTPUT = ROOT / 'output/high-wall-of-lothric/scenery-plan.json'
TARGET_LEVEL = '/Game/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT2'


def spatial_check(actors):
    core_path=OUTPUT.with_name('core-plan.json')
    if not core_path.exists():
        return {'status':'core plan unavailable'}
    core=json.loads(core_path.read_text(encoding='utf-8'))
    def dot(a,b):
        return sum(x*y for x,y in zip(a,b))
    def cross(a,b):
        return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
    def obb(a):
        p,y,r=map(math.radians,a['rotation'])
        cp,sp,cy,sy,cr,sr=math.cos(p),math.sin(p),math.cos(y),math.sin(y),math.cos(r),math.sin(r)
        axes=((cp*cy,cp*sy,sp),(sr*sp*cy-cr*sy,sr*sp*sy+cr*cy,-sr*cp),(-(cr*sp*cy+sr*sy),cy*sr-cr*sp*sy,cr*cp))
        halves=tuple(s/2 for s in a['size'])
        extent=tuple(sum(abs(axes[j][i])*halves[j] for j in range(3)) for i in range(3))
        return (a['location'],halves,axes,extent)
    def intersects(a,b):
        ca,ha,aa,ea=a; cb,hb,ab,eb=b
        delta=tuple(cb[i]-ca[i] for i in range(3))
        if any(abs(delta[i])>=ea[i]+eb[i] for i in range(3)):
            return False
        for axis in list(aa)+list(ab)+[cross(x,y) for x in aa for y in ab]:
            if dot(axis,axis)<1e-12:
                continue
            if abs(dot(delta,axis))>=sum(ha[i]*abs(dot(aa[i],axis))+hb[i]*abs(dot(ab[i],axis)) for i in range(3)):
                return False
        return True
    scenery=[(a,obb(a)) for a in actors]
    blockers=[]; sample_count=0
    for route in core['routes']:
        for a,b in zip(route['points'],route['points'][1:]):
            count=max(1,math.ceil(math.dist(a,b)/100))
            for i in range(count+1):
                pos=[a[k]+(b[k]-a[k])*i/count for k in range(3)]
                sample_count+=1
                player=obb(dict(location=[pos[0],pos[1],pos[2]+120],size=[route['minimum_width'],route['minimum_width'],220],rotation=[0,0,0]))
                for actor,bounds in scenery:
                    if intersects(player,bounds):
                        if actor['mesh']=='Cylinder' and actor['rotation']==[0,0,0] and math.hypot(pos[0]-actor['location'][0],pos[1]-actor['location'][1])>actor['size'][0]/2+route['minimum_width']/2:
                            continue
                        pair=[route['name'],actor['label']]
                        if pair not in blockers:
                            blockers.append(pair)
    buildings=[(a,obb(a)) for a in core['actors'] if a.get('kind')=='mesh']
    dragon_overlaps=[]
    for actor,bounds in scenery:
        if 'Wyvern_' not in actor['label'] or 'Perch' in actor['label']:
            continue
        for building,b in buildings:
            if intersects(bounds,b):
                dragon_overlaps.append([actor['label'],building['label']])
    cliff_top=max(bounds[0][2]+bounds[3][2] for a,bounds in scenery if a.get('collision'))
    assert cliff_top < -399, cliff_top
    return {'status':'checked','route_samples':sample_count,'route_visual_intrusions':blockers,'dragon_core_obb_intersections':dragon_overlaps,'highest_colliding_terrain_world_z':cliff_top,
            'method':'Conservative primitive OBB SAT and route prisms at <=100 cm intervals; upright cylinders use radial rejection.'}


def build_plan():
    actors = []
    rng = random.Random(318)

    def piece(name, position, size, material='Stone', mesh='Cube', rotation=(0, 0, 0), region='10 Distant Lothric', collision=False):
        actors.append(dict(label='HWL_Scenery_' + name, kind='mesh', mesh=mesh,
                           location=list(position), size=list(size), material=material,
                           rotation=list(rotation), region=region, collision=collision))

    def beam(name, a, b, width, depth=None, material='StoneDark', mesh='Cylinder', region='10 Distant Lothric'):
        dx, dy, dz = [b[i] - a[i] for i in range(3)]
        length = math.sqrt(dx*dx + dy*dy + dz*dz)
        pitch = math.degrees(math.atan2(dz, math.hypot(dx, dy)))
        yaw = math.degrees(math.atan2(dy, dx))
        center = [(a[i] + b[i])/2 for i in range(3)]
        if mesh in ('Cylinder', 'Cone'):
            piece(name, center, (width, depth or width, length), material, mesh, (pitch-90, yaw, 0), region)
        else:
            piece(name, center, (length, width, depth or width), material, mesh, (pitch, yaw, 0), region)

    def spire(name, x, y, base, radius, height, region='10 Distant Lothric'):
        piece(name+'_shaft', (x,y,base+height*.31), (radius*1.6,radius*1.6,height*.62), 'Stone','Cylinder',region=region)
        for i,t in enumerate((.08,.36,.61)):
            piece(name+f'_ring{i}',(x,y,base+height*t),(radius*1.9,radius*1.9,100),'Trim','Cylinder',region=region)
        piece(name+'_spire',(x,y,base+height*.82),(radius*2.1,radius*2.1,height*.42),'Roof','Cone',region=region)
        piece(name+'_finial',(x,y,base+height*1.06),(55,55,height*.13),'StoneDark','Cone',region=region)

    def gable(name, x, y, z, w, d, height, region='10 Distant Lothric'):
        angle=math.degrees(math.atan2(height,w/2))
        slope=math.hypot(height,w/2)
        for side in (-1,1):
            piece(name+f'_roof{side}',(x+side*w/4,y,z+height/2),(slope+60,d+180,95),'Roof',rotation=(-side*angle,0,0),region=region)
        piece(name+'_ridge',(x,y,z+height),(80,d+260,100),'Trim',region=region)

    # Northern castle: stepped keep, tall clerestory, narrow dark openings and corner turrets.
    for row,(cy,bz,w,d,h) in enumerate(((29000,5000,17000,4700,5700),(33400,6700,12500,4700,6900),(37700,7900,8000,4200,7600))):
        piece(f'Keep{row}_MountainBase',(-3500,cy,(bz-11000)/2),(w+1200,d+1600,bz+11000),'Rock','Cube')
        piece(f'Keep{row}_Foundation',(-3500,cy,bz-1000),(w+450,d+450,2000),'StoneDark')
        piece(f'Keep{row}',(-3500,cy,bz+h/2),(w,d,h),'StoneWarm')
        for tier in range(4):
            zz=bz+h*(tier+1)/4
            piece(f'Keep{row}_Cornice{tier}',(-3500,cy,zz),(w+160,d+170,120),'Trim')
        count=int(w/1700)
        for j in range(count):
            xx=-3500-w/2+(j+.5)*w/count
            piece(f'Keep{row}_Buttress{j}',(xx,cy-d/2-120,bz+h/2),(230,430,h+230),'Stone')
            spire(f'Keep{row}_Pinnacle{j}',xx,cy-d/2-120,bz+h,160,1600)
            for tier in range(3):
                piece(f'Keep{row}_Lancet{j}_{tier}',(xx+410,cy-d/2-15,bz+1300+tier*1700),(340,40,1150),'Recess')
        gable(f'Keep{row}',-3500,cy,bz+h,w*.9,d,1700)
        for side in (-1,1):
            spire(f'Keep{row}_Corner{side}',-3500+side*w/2,cy,bz,1100,h+4200)
    # A distant colossal arch explicitly leaves the central opening empty.
    cx,cy,base,rad=-13200,26600,8000,4500
    for side in (-1,1):
        piece(f'SkyBridge_Pier{side}',(cx+side*rad,cy,base/2),(1400,1900,base),'StoneDark')
        spire(f'SkyBridge_End{side}',cx+side*rad,cy,base,550,3700)
    for i in range(22):
        a=(i+.5)*math.pi/22
        x=cx+rad*math.cos(a); z=base+rad*math.sin(a)
        piece(f'SkyBridge_Arch{i}',(x,cy,z),(math.pi*rad/22+50,1600,580),'Stone',rotation=(math.degrees(a)-90,0,0))
    piece('SkyBridge_Deck',(cx,cy,base+rad+300),(11000,1700,350),'StoneWarm')
    for i in range(19):
        piece(f'SkyBridge_Merlon{i}',(cx-5200+i*575,cy-800,base+rad+800),(290,220,650),'Trim')

    # Dense settlement drops down the flanks; independent streets are deliberately non-playable scenery.
    for side in (-1,1):
        for row in range(3):
            for j in range(8):
                x=side*(19800+row*3400)+rng.uniform(-300,300)
                y=-7500+j*3850+rng.uniform(-650,650)
                base=-600-row*1700
                w=rng.uniform(1900,2500); d=rng.uniform(2400,3200); h=rng.uniform(3200,5500)
                name=f'Town_{side}_{row}_{j}'
                piece(name+'_RockFoot',(x,y,(base-10000)/2),(w+350,d+400,base+10000),'Rock','Cylinder')
                piece(name,(x,y,base+h/2),(w,d,h),'StoneDark' if row>0 else 'Stone')
                gable(name,x,y,base+h,w,d,w*.68)
                for floor in range(3):
                    piece(name+f'_Course{floor}',(x,y,base+h*(floor+1)/3),(w+110,d+100,90),'Trim')
                    for win in (-1,1):
                        piece(name+f'_Window{floor}_{win}',(x-side*(w/2+5),y+win*d*.23,base+600+floor*1200),(35,310,650),'Recess')
                if j%3==0:
                    spire(name+'_Turret',x+side*w*.45,y+d*.35,base+h-1000,300,3300)
    # Three isolated defensive towers make the far horizon varied and readable.
    for i,(x,y,z) in enumerate(((16500,24800,-600),(-22600,20800,-1000),(21500,-12100,-1800))):
        piece(f'Watchtower{i}_Basement',(x,y,(z-16000)/2),(3200,3200,z+16000),'StoneDark','Cylinder')
        piece(f'Watchtower{i}_RockRoot',(x,y,-15000),(6500,6500,13000),'Rock','Cube',(8,17+i*29,6))
        for band in range(3):
            piece(f'Watchtower{i}_BasementBand{band}',(x,y,z-band*2500),(3500,3500,160),'Trim','Cylinder')
        spire(f'Watchtower{i}',x,y,z,1800,11500)

    # Low infill connects the raised walkways into a city rather than isolated tabletop islands.
    # Roof ridges stay below neighbouring paths; each house descends into the rock bed.
    for i,(x,y,top) in enumerate(((-6700,-4200,2900),(-6600,-900,1700),(-8000,1900,650),(-3500,700,2000),
                                  (500,-8000,2600),(4800,-7200,3100),(10400,-7200,2400),(11700,-1100,2600),
                                  (12700,4300,1000),(11200,10200,-500),(7000,18100,-700),(500,20500,700))):
        name=f'InnerTown{i}'; region='14 Lower City Infill'
        w,d,roof=2200,2600,1100
        piece(name+'_Walls',(x,y,(top-roof-4500)/2),(w,d,top-roof+4500),'StoneDark',region=region)
        gable(name,x,y,top-roof,w,d,roof,region)
        piece(name+'_Eaves',(x,y,top-roof),(w+180,d+180,140),'Trim',region=region)
        for side in (-1,1):
            for win in range(3):
                piece(name+f'_Window{side}_{win}',(x+side*(w/2+10),y-800+win*800,top-roof-850),(30,300,850),'Recess',region=region)

    # Narrow cliff islands rather than a horizontal background plane.
    region='11 Cliff Foundations'
    for row in range(4):
        for col in range(7):
            x=-14000+col*4300+rng.uniform(-500,500)
            y=-11000+row*9300+rng.uniform(-500,500)
            h=rng.uniform(6000,11000)
            top=-500-rng.uniform(0,800)
            sx,sy=rng.uniform(3500,5200)*1.65,rng.uniform(5000,7800)*1.45
            pitch,roll=rng.uniform(-18,18),rng.uniform(-13,13)
            # Rotated overlapping slabs form sloping cliff faces, avoiding isolated round pilings.
            hz=(abs(math.sin(math.radians(pitch)))*sx+abs(math.sin(math.radians(roll))*math.cos(math.radians(pitch)))*sy+abs(math.cos(math.radians(roll))*math.cos(math.radians(pitch)))*h)/2
            piece(f'Cliff_{row}_{col}',(x,y,top-hz),(sx,sy,h),'Rock','Cube',(pitch,rng.uniform(-40,40),roll),region,True)
            for shoulder in range(2):
                piece(f'Cliff_Shoulder_{row}_{col}_{shoulder}',(x+rng.uniform(-2300,2300),y+rng.uniform(-2200,2200),top-h*.85),(5100,6000,h*.8),'Rock','Cube',(0,rng.uniform(-50,50),0),region,True)
    # A connected sloped mountain mass joins the overlapping faces far below the playable level.
    # Its varying tilted tops all remain below -1400 cm; it is not a flat floor or playable landscape.
    for row in range(3):
        for col in range(3):
            x=-14000+col*14500; y=-10500+row*18000
            sx,sy,sz=19000,23500,18000
            pitch=(-1 if col%2 else 1)*(12+row*3)
            roll=(-1 if row%2 else 1)*11
            hz=(abs(math.sin(math.radians(pitch)))*sx+abs(math.sin(math.radians(roll))*math.cos(math.radians(pitch)))*sy+abs(math.cos(math.radians(roll))*math.cos(math.radians(pitch)))*sz)/2
            piece(f'MountainHeart_{row}_{col}',(x,y,-1500-hz),(sx,sy,sz),'Rock','Cube',(pitch,15+col*7,roll),region,True)

    def tree(name,x,y,z,scale=1):
        region='12 Bare Trees and Banners'
        points=[(x,y,z),(x+40*scale,y,z+700*scale),(x-80*scale,y+50*scale,z+1350*scale),(x+120*scale,y+80*scale,z+2200*scale)]
        for i in range(3):
            beam(name+f'_Trunk{i}',points[i],points[i+1],(140-i*37)*scale,material='Wood',region=region)
        for i in range(5):
            ang=i*2.3; zz=z+(650+i*190)*scale
            start=(x,y,zz)
            mid=(x+math.cos(ang)*500*scale,y+math.sin(ang)*500*scale,zz+350*scale)
            tip=(x+math.cos(ang+.2)*850*scale,y+math.sin(ang+.2)*850*scale,zz+660*scale)
            beam(name+f'_Branch{i}',start,mid,65*scale,material='Wood',region=region)
            beam(name+f'_Twig{i}',mid,tip,25*scale,material='Wood',region=region)
    for i,(x,y,z) in enumerate(((-16200,-10400,100),(-15700,-4000,0),(-15700,1500,0),(-14400,9500,0),(-13200,16800,0),(-10500,22800,0),(11600,-11300,0),(12800,-6200,0),(13500,7800,0),(14000,16000,0),(11000,23000,0))):
        tree(f'DeadTree{i}',x,y,z,rng.uniform(.7,1.25))
        piece(f'Tree_Plinth{i}',(x,y,z-2200),(1800,1500,4400),'StoneDark',region='12 Bare Trees and Banners')
    for i,(x,y,z) in enumerate(((-12800,-11500,5600),(11200,-4500,4900),(13000,10000,2100),(-14300,18800,2300))):
        region='12 Bare Trees and Banners'
        piece(f'Banner{i}_Foundation',(x,y,(z-4000)/2),(1300,1300,z+4000),'Stone','Cylinder',region=region)
        for tier in range(3):
            piece(f'Banner{i}_FoundationRing{tier}',(x,y,z-tier*1100),(1500,1500,150),'Trim','Cylinder',region=region)
        beam(f'Banner{i}_Pole',(x,y,z),(x,y,z+2400),50,material='Wood',region=region)
        beam(f'Banner{i}_Cross',(x-550,y,z+2200),(x+550,y,z+2200),45,material='Wood',region=region)
        for j in range(4):
            piece(f'Banner{i}_Cloth{j}',(x-375+j*250,y+math.sin(j)*50,z+1400-j*50),(255,35,1450-j*100),'Cloth',rotation=(0,0,(-1)**j*4),region=region)

    def dragon(name, center, scale, corpse=False, yaw=0):
        region='13 Static Wyvern Silhouettes'
        angle=math.radians(yaw)
        def world(p):
            x,y,z=p
            return (center[0]+scale*(x*math.cos(angle)-y*math.sin(angle)),center[1]+scale*(x*math.sin(angle)+y*math.cos(angle)),center[2]+scale*z)
        def form(s,p,size,mat='StoneDark',mesh='Sphere',rotation=(0,0,0)):
            piece(name+'_'+s,world(p),tuple(n*scale for n in size),mat,mesh,(rotation[0],rotation[1]+yaw,rotation[2]),region)
        def bone(s,a,b,w,mat='StoneDark',mesh='Cylinder'):
            beam(name+'_'+s,world(a),world(b),w*scale,material=mat,mesh=mesh,region=region)
        form('Thorax',(0,0,0),(1000,1950,900))
        form('Pelvis',(0,800,-80),(720,850,640))
        neck=[(0,-750,100),(0,-1300,170),(-80,-1820,80),(-180,-2240,-90)]
        for i in range(len(neck)-1):
            bone(f'Neck{i}',neck[i],neck[i+1],540-i*75)
            form(f'NeckPlate{i}',neck[i],(640-i*75,430,420),'Rock')
        form('Skull',(-210,-2440,-100),(680,980,420),'Rock')
        form('Muzzle',(-210,-2850,-175),(480,590,250),'StoneDark')
        form('LowerJaw',(-210,-2720,-370),(400,800,100),'Rock',rotation=(-12,0,0))
        for side in (-1,1):
            form(f'Eye{side}',(-210+side*285,-2590,-40),(55,120,60),'Recess')
            bone(f'Horn{side}',(-210+side*230,-2240,100),(-210+side*600,-1640,500),150,'StoneWarm','Cone')
            for tooth in range(4):
                bone(f'Tooth{side}_{tooth}',(-210+side*190,-2500-tooth*130,-230),(-210+side*160,-2500-tooth*130,-390),55,'StoneWarm','Cone')
            # Jointed legs with three unmistakable hooked toes.
            hip=(side*330,550,-150); knee=(side*820,800,-600); ankle=(side*900,200,-900)
            bone(f'Thigh{side}',hip,knee,400)
            bone(f'Shin{side}',knee,ankle,230)
            form(f'Foot{side}',(side*900,-10,-900),(330,680,220),'Rock')
            for toe in range(3):
                a=(side*900+(toe-1)*145,-210,-880); b=(a[0],-640,-940)
                bone(f'Claw{side}_{toe}',a,b,105,'StoneWarm','Cone')
            # Elbow bends then five finger rays fan out. Lenticular strips fill the membrane.
            root=(side*320,-360,200)
            elbow=(side*1500,-250,1100 if not corpse else 550)
            wrist=(side*2700,-500,2000 if not corpse else 1000)
            bone(f'WingArm{side}',root,elbow,220)
            bone(f'WingForearm{side}',elbow,wrist,150)
            tips=[(side*4050,-850,2100),(side*4400,700,1250),(side*3700,2050,450),(side*2450,2550,0),(side*900,1750,-100)]
            if corpse:
                tips=[(x,y,z*.35) for x,y,z in tips]
            for finger,tip in enumerate(tips):
                bone(f'WingFinger{side}_{finger}',wrist,tip,95-finger*8,'Rock')
                # Tapering strips interpolate a fan sector, producing a scalloped outer silhouette.
                if finger==len(tips)-1:
                    continue
                nxt=tips[finger+1]
                for band in range(4):
                    t=(band+.5)/4
                    end=tuple(tip[k]*(1-t)+nxt[k]*t for k in range(3))
                    contraction=1-.19*math.sin(t*math.pi)
                    end=tuple(wrist[k]+(end[k]-wrist[k])*contraction for k in range(3))
                    width=math.dist(tip,nxt)/4*1.15
                    a=world(wrist); b=world(end)
                    # Flat ellipsoids avoid square fabric ends while preserving a stretched skin silhouette.
                    beam(name+f'_Membrane{side}_{finger}_{band}',a,b,width*scale,38*scale,'Cloth' if corpse else 'StoneWarm','Sphere',region)
            bone(f'WingHook{side}',wrist,(wrist[0]+side*200,wrist[1]-550,wrist[2]+250),110,'StoneWarm','Cone')
        tail=[(0,1000,-60),(250,1650,-200),(850,2200,-450),(1650,2450,-700),(2350,2100,-900),(2650,1550,-1050),(2430,1150,-1110)]
        for i in range(len(tail)-1):
            bone(f'Tail{i}',tail[i],tail[i+1],max(45,410-i*63))
        for i in range(12):
            yy=-1800+i*295
            zz=420-abs(yy+100)*.07
            bone(f'Spine{i}',(0,yy,zz),(0,yy+100,zz+340+70*math.sin(i)),125,'StoneWarm','Cone')
        for side in (-1,1):
            for i in range(6):
                form(f'Rib{side}_{i}',(side*390,-520+i*220,180),(95,180,700),'Rock',rotation=(0,0,side*32))

    dragon('DeadWyvern',(900,-7400,6900),.8,True,-40)
    dragon('PerchedWyvern',(6100,-2600,7100),.87,False,-10)

    # Dedicated ruined perches meet the feet and descend into the cliff bedrock.
    # They stand beside the paths; the dead wyvern was moved east to avoid the inner-wall stair.
    for name,x,y,top in [('DeadWyvern',900,-7400,6092),('PerchedWyvern',6100,-2600,6221)]:
        region='13 Static Wyvern Silhouettes'
        piece(name+'_Perch',(x,y,(top-4500)/2),(2600,2600,top+4500),'Stone','Cylinder',region=region)
        for tier in range(5):
            piece(name+f'_PerchCourse{tier}',(x,y,top-tier*1600),(2780,2780,120),'StoneWarm','Cylinder',region=region)

    assert len({a['label'] for a in actors}) == len(actors)
    assert all(a['mesh'] in ('Cube','Cylinder','Cone','Sphere') for a in actors)
    assert all(len(a['size']) == 3 and min(a['size']) > 0 for a in actors)
    assert all(a['location'][2]+a['size'][2]/2 < -399 for a in actors if a['collision'])
    return dict(target_level=TARGET_LEVEL, origin=[0,0,0], actors=actors,offline_clearance=spatial_check(actors),
                assumptions=['Screenshot-based silhouette reconstruction, not measured game geometry.',
                             'Wyverns are static primitive sculpture silhouettes with no AI, damage, animations or collision.',
                             'Background castle, town, trees and banners are non-playable scenery.',
                             'All colliding cliff components remain below z -400 cm; no ground plane covers playable lower routes.'],
                source_refs=['references/overview0.jpg','references/first-bonfire0.jpg','references/tower-bonfire0.jpg','references/wyvern0.jpg'])


if __name__ == '__main__':
    result=build_plan()
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'output':str(OUTPUT),'actors':len(result['actors']),'collision':sum(a['collision'] for a in result['actors'])}))
