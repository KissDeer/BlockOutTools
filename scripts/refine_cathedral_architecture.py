"""Reference-led, static Cathedral shell. Pure plan generation; never accesses UE.

Dimensions are centimetres. Existing traversal geometry is retained. Roofs are
separate editor folders, visible by default. Run directly to save the manifest.
"""
import json
import math
from pathlib import Path

OUTPUT = Path(__file__).resolve().parents[1] / 'output/cathedral-of-the-deep/architecture-v2.json'


def build_plan():
    actors = []
    shell = '08_Architecture_Shell'
    roofs = '08_Architecture_Roofs'
    detail = '09_Architecture_Interior'

    def box(name, location, size, material='Stone', rotation=(0, 0, 0), mesh='Cube', region=shell):
        actors.append(dict(label='COTD_Detail_' + name, kind='mesh', mesh=mesh,
                           region=region, location=list(location), size=list(size),
                           rotation=list(rotation), material=material))

    def beam(name, a, b, width=100, depth=100, material='Trim', region=shell):
        dx, dy, dz = [b[i] - a[i] for i in range(3)]
        length = math.sqrt(dx * dx + dy * dy + dz * dz)
        box(name, [(a[i] + b[i]) / 2 for i in range(3)], (length, width, depth), material,
            (math.degrees(math.atan2(dz, math.hypot(dx, dy))), math.degrees(math.atan2(dy, dx)), 0), region=region)

    def arch(name, center, radius, spring, thickness=95, depth=140, yaw=0, material='Trim', segments=12, region=shell):
        # Real open arch: individual voussoirs, no dark solid behind the opening.
        angle = math.radians(yaw)
        def point(t):
            u = math.cos(t) * radius
            return (center[0] + math.cos(angle) * u, center[1] + math.sin(angle) * u,
                    spring + math.sin(t) * radius)
        for i in range(segments):
            beam(f'{name}_Voussoir_{i:02}', point(i * math.pi / segments),
                 point((i + 1) * math.pi / segments), depth, thickness, material, region)

    def wall_grid(name, fixed, low, high, bottom, top, holes, axis='x', thickness=180, material='Stone'):
        # Split wall in both axes around real holes. Merge vertically per strip.
        us = sorted({low, high} | {max(low, min(high, h[j])) for h in holes for j in (0, 1)})
        zs = sorted({bottom, top} | {max(bottom, min(top, h[j])) for h in holes for j in (2, 3)})
        count = 0
        for a, b in zip(us, us[1:]):
            spans = []
            for c, d in zip(zs, zs[1:]):
                if any(h[0] < (a+b)/2 < h[1] and h[2] < (c+d)/2 < h[3] for h in holes):
                    continue
                if spans and spans[-1][1] == c:
                    spans[-1] = (spans[-1][0], d)
                else:
                    spans.append((c, d))
            for c, d in spans:
                if axis == 'x':
                    pos, size = ((a+b)/2, fixed, (c+d)/2), (b-a, thickness, d-c)
                else:
                    pos, size = (fixed, (a+b)/2, (c+d)/2), (thickness, b-a, d-c)
                box(f'{name}_{count:03}', pos, size, material)
                count += 1

    def pitched_roof(name, cx, cy, width, length, eave, ridge):
        half, rise = width / 2, ridge - eave
        angle = math.degrees(math.atan2(rise, half))
        slope = math.hypot(half, rise)
        for side in (-1, 1):
            box(f'{name}_Slate_{side}', (cx + side*half/2, cy, (eave+ridge)/2),
                (slope+100, length, 95), 'Roof', (-side*angle, 0, 0), region=roofs)
            box(f'{name}_Eave_{side}', (cx+side*half, cy, eave), (110, length+80, 140), 'Trim', region=roofs)
            for j in range(1, 5):
                t = j / 5
                box(f'{name}_SlateSeam_{side}_{j}', (cx+side*half*t, cy, ridge-rise*t+50),
                    (28, length, 20), 'StoneDark', (-side*angle, 0, 0), region=roofs)
        box(f'{name}_Ridge', (cx, cy, ridge+45), (135, length+130, 135), 'Trim', region=roofs)

    def gable(name, cx, y, width, bottom, top, thickness=180):
        count = math.ceil((top-bottom)/140)
        dz = (top-bottom)/count
        for i in range(count):
            w = width * (1-i/count)
            box(f'{name}_Fill_{i:02}', (cx, y, bottom+(i+.5)*dz), (w, thickness, dz+1))
        beam(name+'_LeftRake', (cx-width/2,y-40,bottom), (cx,y-40,top), 180, 150)
        beam(name+'_RightRake', (cx,y-40,top), (cx+width/2,y-40,bottom), 180, 150)

    # Front shell: imposing recessed portal, tiered arcades, paired slender towers.
    holes = [(-900,900,0,1900)]
    for row, (z, xs) in enumerate(((2400,[-2850,-1450,0,1450,2850]), (3900,[-2750,-1375,0,1375,2750]))):
        for i, x in enumerate(xs):
            holes.append((x-310,x+310,z,z+1000))
            for side in (-1,1):
                box(f'Front_WindowJamb_{row}_{i}_{side}', (x+side*350,-2080,z+380), (100,150,760), 'Trim')
            arch(f'Front_WindowArch_{row}_{i}', (x,-2080), 350, z+710, 100, 150)
            box(f'Front_WindowSill_{row}_{i}', (x,-2090,z-35), (850,210,110), 'Trim')
            box(f'Front_WindowMullion_{row}_{i}', (x,-1960,z+450), (55,130,900), 'StoneDark')
    wall_grid('Front_MainWall',-1950,-4000,4000,0,5100,holes,thickness=270)
    # The rectangular opening has an arch crown with 19 m central clearance.
    for band, radius in enumerate((1000,1190,1380)):
        arch(f'Front_PortalBand_{band}',(0,-2140-band*55),radius,1200,145,170,segments=16)
        for side in (-1,1):
            box(f'Front_PortalColumn_{band}_{side}',(side*radius,-2140-band*55,600),(130,170,1200),'Trim',mesh='Cylinder')
            box(f'Front_PortalBase_{band}_{side}',(side*radius,-2140-band*55,90),(220,250,180),'StoneDark')
    for z in (2000,3650,5100):
        box(f'Front_Cornice_{z}',(0,-2070,z),(8240,320,130),'Trim')
        box(f'Front_CorniceShadow_{z}',(0,-2030,z-110),(8160,240,75),'StoneDark')
    # Broad central gable reads as a church rather than disconnected platforms.
    gable('Front_Gable',0,-1950,8000,5100,6800,250)
    arch('Front_GableOculus',(0,-2140),400,5580,110,100,segments=16)
    for i in range(12):
        a,b=math.pi+i*math.pi/12,math.pi+(i+1)*math.pi/12
        beam(f'Front_GableOculusLower_{i}',(400*math.cos(a),-2140,5580+400*math.sin(a)),
             (400*math.cos(b),-2140,5580+400*math.sin(b)),100,110)
    box('Front_GableOculusShadow',(0,-2110,5580),(650,650,70),'Recess',mesh='Cylinder',rotation=(0,0,90))
    for side in (-1,1):
        x = side*3800
        box(f'FrontTurret_{side}_Shaft',(x,-1860,2880),(580,730,5760),'StoneDark')
        for z in (180,2100,3700,5650):
            box(f'FrontTurret_{side}_Cornice_{z}',(x,-1860,z),(760,890,160),'Trim')
        for z in (950,2700,4450):
            box(f'FrontTurret_{side}_Slit_{z}',(x,-2235,z),(145,30,650),'Recess')
            arch(f'FrontTurret_{side}_SlitArch_{z}',(x,-2290),140,z+330,75,75,segments=8)
        box(f'FrontTurret_{side}_Cone',(x,-1860,6280),(860,1000,1260),'Roof',mesh='Cone')
        box(f'FrontTurret_{side}_Finial',(x,-1860,7060),(95,95,360),'Trim',mesh='Cone')

    # Clerestory walls enclose the existing galleries without closing access holes.
    window_ys = (-200,1400,3000,4600,6200,8050)
    for side in (-1,1):
        openings = [(y-340,y+340,3300,4380) for y in window_ys]
        openings += [(7400,8250,2620,3290)] if side == -1 else [(6020,7180,1800,2970)]
        lower_openings = [(1800,3000,0,1030)] if side == -1 else [(-1280,-100,0,1030),(6020,7180,1750,2000)]
        wall_grid(f'SideLower_{side}',side*4010,-1750,8750,0,2000,lower_openings,axis='y',thickness=230)
        wall_grid(f'SideUpper_{side}',side*4000,-1750,8750,2000,4750,openings,axis='y',thickness=230)
        for i, y in enumerate(window_ys):
            arch(f'SideWindow_{side}_{i}',(side*4140,y),380,4090,95,120,90)
            box(f'SideWindowSill_{side}_{i}',(side*4130,y,3270),(300,900,110),'Trim')
            for edge in (-1,1):
                box(f'SideWindowJamb_{side}_{i}_{edge}',(side*4140,y+edge*390,3680),(130,110,780),'Trim')
            box(f'SideWindowMullion_{side}_{i}',(side*3990,y,3810),(100,50,1030),'StoneDark')
        for z in (3120,4650):
            box(f'SideStringCourse_{side}_{z}',(side*4130,3500,z),(330,10700,140),'Trim')
        # Tall piers and upper flying buttresses avoid the traversable terrace deck.
        for i,y in enumerate((-1450,700,2850,5000,8350)):
            outer = 5550 if side == -1 and y < 3000 else 5150
            box(f'Buttress_{side}_{i}_WallSpine',(side*4150,y,2360),(450,430,4720),'StoneDark')
            box(f'Buttress_{side}_{i}_OuterPier',(side*outer,y,1780),(520,570,3560),'StoneDark')
            for z in (180,1500,2940,3540):
                box(f'Buttress_{side}_{i}_PierCourse_{z}',(side*outer,y,z),(660,710,110),'Trim')
            beam(f'Buttress_{side}_{i}_FlyingUpper',(side*4180,y,4450),(side*outer,y,3300),340,340,'Stone')
            beam(f'Buttress_{side}_{i}_FlyingLower',(side*4200,y,3670),(side*outer,y,2840),230,210,'StoneDark')
            box(f'Buttress_{side}_{i}_Pinnacle',(side*outer,y,3890),(450,450,660),'Roof',mesh='Cone')
        # Long lean-to roofs over galleries; do not cover east entry or rafter access.
        for i,(lo,hi) in enumerate(((-1600,5700),(7300,8650)) if side==1 else ((-1600,7100),(8450,8650))):
            beam(f'GalleryCanopy_{side}_{i}',(side*4060,(lo+hi)/2,3110),(side*5100,(lo+hi)/2,2390),hi-lo,90,'Roof',roofs)
    pitched_roof('NaveRoof',0,3430,8700,11100,4820,6650)

    # Northern apse. Crossing at y 9100, z 1800 stays a genuine opening.
    for side in (-1,1):
        openings=[(8670,9510,1690,2490),(9870,10550,3050,4150),(10900,11580,3050,4150)]
        wall_grid(f'ApseSide_{side}',side*3000,8750,11750,1300,4650,openings,axis='y',thickness=220)
        for i,y in enumerate((10210,11240)):
            arch(f'ApseSideWindow_{side}_{i}',(side*3140,y),380,3830,100,140,90)
        box(f'ApseSideCornice_{side}',(side*3040,10250,4600),(360,3200,160),'Trim')
    wall_grid('ApseEnd',11750,-3000,3000,1300,4650,[(-450,450,2450,4130),(-1940,-1260,2850,4050),(1260,1940,2850,4050)],thickness=240)
    for i,x in enumerate((-1600,0,1600)):
        arch(f'ApseEndArch_{i}',(x,11900),480 if x==0 else 380,3770,100,170)
    gable('ApseRearGable',0,11750,6000,4650,6300)
    pitched_roof('ApseRoof',0,10330,6420,3270,4700,6360)
    for side in (-1,1):
        for y in (10100,11650):
            box(f'ApseButtress_{side}_{y}',(side*3260,y,2200),(500,500,4400),'StoneDark')
            box(f'ApseButtressCap_{side}_{y}',(side*3260,y,4640),(580,580,580),'Roof',mesh='Cone')

    # Interior structural rhythm: the nave remains open across its central route.
    for side in (-1,1):
        x=side*2250
        for i,y in enumerate((-200,2000,4200,6400,8400)):
            for z,w,h in ((3350,690,160),(3500,520,140)):
                box(f'InteriorCapital_{side}_{i}_{z}',(x,y,z),(w,w,h),'Trim',region=detail)
            # High flutes do not enlarge the column at the stair landing.
            for k in (-1,1):
                box(f'ColumnFlute_{side}_{i}_{k}',(x+k*160,y-165,1900),(70,70,2440),'StoneWarm',mesh='Cylinder',region=detail)
        ys=(-200,2000,4200,6400,8400)
        for i,(a,b) in enumerate(zip(ys,ys[1:])):
            arch(f'LongitudinalArcade_{side}_{i}',(x,(a+b)/2),(b-a)/2,3450,150,180,90,region=detail)
    for i,y in enumerate((-200,2000,4200,6400,8400)):
        arch(f'NaveVaultRib_{i}',(0,y),2250,3470,130,150,segments=16,region=detail)
        box(f'VaultKey_{i}',(0,y,5720),(220,230,200),'StoneWarm',region=detail)
    beam('VaultRidgeRib',(0,-200,5720),(0,8400,5720),130,160,'Trim',detail)
    # Furnishings remain blockout massing; side rows preserve the central 12 m aisle.
    for side in (-1,1):
        for i,y in enumerate((450,1250,4050,4850,6800,7500)):
            # Do not fill giant courts or the west shortcut turning lane.
            x=side*1550
            if (side==-1 and 1800<y<3600) or (side==1 and 4200<y<6600):
                continue
            box(f'Pew_{side}_{i}_Seat',(x,y,110),(880,230,80),'StoneDark',region=detail)
            box(f'Pew_{side}_{i}_Back',(x,y+95,215),(880,65,290),'StoneDark',region=detail)
            for leg in (-1,1):
                box(f'Pew_{side}_{i}_Leg_{leg}',(x+leg*360,y,50),(90,190,100),'StoneWarm',region=detail)
    # Monumental northern tomb behind the traversable arena, with tiered altar.
    for i,(w,d,z,h) in enumerate(((2200,1050,70,140),(1960,920,175,70),(1720,750,335,250),(1930,850,505,90))):
        box(f'HighAltar_Tier_{i}',(0,11180,z),(w,d,h),'StoneDark' if i==2 else 'Trim',region=detail)
    for x in (-1200,1200):
        box(f'HighAltar_TombPier_{x}',(x,11350,1030),(270,320,2060),'StoneDark',region=detail)
        box(f'HighAltar_TombCap_{x}',(x,11350,2160),(390,440,170),'Trim',region=detail)
    arch('HighAltarBaldachin',(0,11350),1230,2120,170,280,segments=16,region=detail)
    for side in (-1,1):
        for i,y in enumerate((550,3750,7000,10100)):
            x=side*2050
            box(f'Candelabrum_{side}_{i}_Base',(x,y,50),(220,220,100),'StoneDark',mesh='Cylinder',region=detail)
            box(f'Candelabrum_{side}_{i}_Stem',(x,y,255),(60,60,420),'StoneWarm',mesh='Cylinder',region=detail)
            box(f'Candelabrum_{side}_{i}_Bowl',(x,y,485),(200,200,75),'Trim',mesh='Cylinder',region=detail)
            for c in (-1,0,1):
                box(f'Candelabrum_{side}_{i}_Candle_{c}',(x+c*57,y,555),(30,30,100),'Candle',mesh='Cylinder',region=detail)

    # Cleansing Chapel and Rosaria become enclosed, recognisable side churches.
    for name,cx,cy,width,length,bottom,eave,ridge in (
        ('Chapel',0,-7000,3500,3400,900,1250,2280),
        ('Rosaria',-8800,9400,2880,3120,3700,4060,5030)):
        pitched_roof(name+'Roof',cx,cy,width,length,eave,ridge)
        for y in (cy-length/2+140,cy+length/2-140):
            box(f'{name}_UpperEnd_{y}',(cx,y,(bottom+eave)/2),(width-230,170,eave-bottom),'StoneWarm')
            gable(f'{name}_Gable_{y}',cx,y,width-230,eave,ridge-70)
        for side in (-1,1):
            box(f'{name}_UpperSide_{side}',(cx+side*(width/2-140),cy,(bottom+eave)/2),(190,length-250,eave-bottom),'StoneWarm')
            for i,y in enumerate((cy-length/2+200,cy+length/2-200)):
                x=cx+side*(width/2-130)
                box(f'{name}_CornerPier_{side}_{i}',(x,y,(bottom+eave)/2),(330,330,eave-bottom+180),'Trim')
                box(f'{name}_CornerFinial_{side}_{i}',(x,y,eave+310),(330,330,570),'Roof',mesh='Cone')
    # Small chapel bellcote and rear chimney-like tower silhouettes.
    for side in (-1,1):
        box(f'ChapelBellcotePier_{side}',(side*260,-8510,2450),(160,260,850),'StoneDark')
    arch('ChapelBellcoteArch',(0,-8510),260,2800,120,260,segments=10)
    box('ChapelBell',(0,-8510,2550),(240,240,270),'StoneWarm',mesh='Cone')
    # Viewed chapel reference: central rug, a pointed altar shrine, ordered seats.
    box('Chapel_Runner',(0,-7540,2),(540,1750,4),'Cloth',region=detail)
    box('Chapel_AltarShrineBack',(0,-5620,570),(1080,150,1100),'StoneDark',region=detail)
    box('Chapel_AltarShrineFace',(0,-5730,380),(900,190,680),'StoneWarm',region=detail)
    for side in (-1,1):
        box(f'Chapel_AltarShrinePillar_{side}',(side*540,-5750,670),(130,190,1320),'Trim',region=detail)
        beam(f'Chapel_AltarShrinePediment_{side}',(side*610,-5750,1250),(0,-5750,1730),170,140,'Trim',detail)
        for i,y in enumerate((-8100,-7650,-6600)):
            x=side*1040
            box(f'Chapel_Pew_{side}_{i}_Seat',(x,y,100),(620,210,65),'StoneDark',region=detail)
            box(f'Chapel_Pew_{side}_{i}_Back',(x,y+80,225),(620,70,285),'StoneDark',region=detail)
            for end in (-1,1):
                box(f'Chapel_Pew_{side}_{i}_Leg_{end}',(x+end*240,y,60),(80,200,120),'StoneDark',region=detail)
        for i,y in enumerate((-8190,-6150)):
            box(f'Chapel_InteriorPilaster_{side}_{i}',(side*1440,y,555),(150,200,1110),'Trim',region=detail)
    for i,x in enumerate((-400,-270,-140,140,270,400)):
        box(f'Chapel_AltarCandle_{i}',(x,-5850,820),(35,35,150),'Candle',mesh='Cylinder',region=detail)
    # Rosaria reference: dense overhead ribs, hanging cloth and candle chandeliers.
    for i,y in enumerate((8350,9100,9850,10600)):
        for side in (-1,1):
            beam(f'Rosaria_CeilingRib_{i}_{side}',(-8800+side*1280,y,3980),(-8800,y,4880),90,120,'StoneDark',detail)
            box(f'Rosaria_ArcadePier_{i}_{side}',(-8800+side*1140,y,3370),(160,220,1100),'StoneWarm',region=detail)
            box(f'Rosaria_ArcadeCapital_{i}_{side}',(-8800+side*1140,y,3910),(280,320,130),'Trim',region=detail)
    for side in (-1,1):
        for i,y in enumerate((8725,9475,10225)):
            arch(f'Rosaria_ArcadeArch_{side}_{i}',(-8800+side*1140,y),375,3920,90,110,90,segments=9,region=detail)
            box(f'Rosaria_HangingCloth_{side}_{i}',(-8800+side*840,y,4160),(290,30,710),'Cloth',region=detail)
            box(f'Rosaria_ClothHem_{side}_{i}',(-8800+side*840,y,3820),(305,45,55),'StoneWarm',region=detail)
    for i,y in enumerate((8720,9970)):
        box(f'Rosaria_ChandelierChain_{i}',(-8800,y,4400),(35,35,810),'StoneDark',mesh='Cylinder',region=detail)
        for side in (-1,1):
            box(f'Rosaria_ChandelierArm_{i}_{side}',(-8800+side*200,y,4000),(400,65,65),'StoneDark',region=detail)
        for j,x in enumerate((-350,-175,0,175,350)):
            box(f'Rosaria_ChandelierCandle_{i}_{j}',(-8800+x,y,4140),(35,35,240),'Candle',mesh='Cylinder',region=detail)
    for side in (-1,1):
        box(f'RearTurret_{side}',(side*3600,8580,4200),(500,570,2450),'StoneDark')
        box(f'RearTurretCornice_{side}',(side*3600,8580,5460),(670,740,160),'Trim')
        box(f'RearTurretCap_{side}',(side*3600,8580,5970),(750,820,960),'Roof',mesh='Cone')

    # Compact, slumped kneeling figures replace the upright scale-marker columns.
    # These are static sculptural silhouettes, with no collisions or gameplay.
    for giant,(cx,cy) in enumerate(((-950,2300),(950,5400))):
        start=len(actors)
        prefix=f'KneelingGiant_{giant}'
        def figure_piece(part, offset, size, material='StoneDark', rotation=(0,0,0), mesh='Cube'):
            box(prefix+'_'+part,(cx+offset[0],cy+offset[1],offset[2]),size,material,rotation,mesh,detail)
        def limb(part, a, b, width=95):
            beam(prefix+'_'+part,(cx+a[0],cy+a[1],a[2]),(cx+b[0],cy+b[1],b[2]),width,width,'StoneDark',detail)
        figure_piece('Pelvis',(0,55,360),(285,230,230))
        figure_piece('SlumpedTorso',(0,15,640),(300,235,430),rotation=(0,0,14))
        figure_piece('Shoulders',(0,-35,810),(410,180,150),rotation=(0,0,8))
        figure_piece('UpperBack',(0,100,720),(250,140,245),rotation=(0,0,14))
        figure_piece('BentNeck',(0,-50,875),(145,140,160),rotation=(0,0,22),mesh='Cylinder')
        figure_piece('BowedHead',(0,-90,957),(200,185,210),'StoneWarm',rotation=(0,0,16))
        figure_piece('HeavyBrow',(0,-184,970),(170,44,44),'StoneDark',rotation=(0,0,16))
        figure_piece('FacePlane',(0,-179,915),(115,45,100),'StoneWarm',rotation=(0,0,16))
        for side in (-1,1):
            limb(f'BentThigh_{side}',(side*110,50,390),(side*155,-115,195),125)
            figure_piece(f'Knee_{side}',(side*155,-120,185),(150,145,155))
            limb(f'FoldedShin_{side}',(side*155,-100,150),(side*155,105,80),100)
            figure_piece(f'Foot_{side}',(side*150,155,65),(120,150,85))
            limb(f'UpperArm_{side}',(side*175,-35,780),(side*190,-120,490),95)
            figure_piece(f'Elbow_{side}',(side*190,-120,480),(95,105,110),'StoneWarm')
            limb(f'Forearm_{side}',(side*190,-120,470),(side*85,-165,320),95)
            figure_piece(f'RestingHand_{side}',(side*80,-165,305),(110,115,65),'StoneWarm')
        for actor in actors[start:]:
            actor['collision']=False

    labels=[a['label'] for a in actors]
    assert len(labels)==len(set(labels))
    assert all(min(a['size'])>0 for a in actors)
    return dict(schema='cathedral-architecture-v2', actors=actors,
                hide_existing_labels=[f'COTD_Pointed_Arch_{i}_{j}' for i in range(3) for j in range(4)],
                existing_overrides=[dict(label=f'COTD_Giant_Scale_{part}_{i}',hidden=True,collision=False)
                                    for i in range(2) for part in ('Body','Head')],
                references=['http://darksouls3.wikidot.com/locationgroup:cathedral-of-the-deep',
                            'http://darksouls3.wdfiles.com/local--files/image-set:areas/cathedral-of-the-deep-sq.jpg'],
                assumptions=['Exterior proportions reconstructed from viewed reference; no calibrated source measurements.',
                             'Existing exploration topology retained; exterior and interior architecture are interpretive.',
                             'All furnishing, candle, bell and tomb pieces are static geometric proxies with no gameplay logic.'])


if __name__ == '__main__':
    plan=build_plan()
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'actors':len(plan['actors']),'path':str(OUTPUT),'roles':sorted({a['material'] for a in plan['actors']})}))
