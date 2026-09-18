"""Generate reference-informed exterior dressing; never opens or mutates Unreal.

All positions are centimetres in the original cathedral plan's local space.
Existing traversal geometry is left intact. Run from any directory with Python.
"""
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/cathedral-of-the-deep/plan.json'
OUTPUT = ROOT / 'output/cathedral-of-the-deep/grounds-v2.json'


def distance_to_segment(x, y, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, ((x-a[0])*dx + (y-a[1])*dy) / (dx*dx+dy*dy or 1)))
    return math.hypot(x-a[0]-t*dx, y-a[1]-t*dy)


def build_plan():
    source = json.loads(SOURCE.read_text(encoding='utf-8'))
    rng = random.Random(3182026)
    actors, clearance = [], []

    def is_clear(x, y, radius=0, margin=350):
        return all(distance_to_segment(x, y, a, b) >= route['minimum_width']/2 + radius + margin
                   for route in source['routes'] for a, b in zip(route['points'], route['points'][1:]))

    def mesh(name, region, location, size, material='StoneDark', rotation=(0, 0, 0), shape='Cube', collision=True):
        actors.append(dict(label='COTD_Ground_'+name, kind='mesh', region=region, mesh=shape,
                           location=[round(v, 3) for v in location], size=[round(v, 3) for v in size],
                           rotation=[round(v, 3) for v in rotation], material=material, collision=collision))

    def layer(name, x, y, w, d, bottom, top, material='Earth'):
        assert top <= -80, (name, top)
        mesh(name, '10 Site Earth and Rock', (x, y, (bottom+top)/2), (w, d, top-bottom), material)

    def branch(name, a, b, diameter):
        delta = [b[i]-a[i] for i in range(3)]
        length = math.sqrt(sum(v*v for v in delta))
        yaw = math.degrees(math.atan2(delta[1], delta[0]))
        pitch = math.degrees(math.atan2(delta[2], math.hypot(*delta[:2]))) - 90
        mesh(name, '13 Barren Tree Silhouettes', [(a[i]+b[i])/2 for i in range(3)],
             (diameter, diameter, length+3), 'Wood', (pitch, yaw, 0), 'Cylinder', False)

    # The whole site rests on terraces, then breaks into irregular exposed shoulders.
    # The 100 cm gap below authored floors retains original floor collision and falls.
    layer('SiteCore', -500, 800, 26200, 29100, -1500, -100)
    layer('SouthApron', 300, -14300, 19000, 3600, -1700, -150)
    layer('NorthShoulder', -800, 16000, 22000, 2400, -2000, -350)
    layer('WestShoulder', -14700, 1400, 3400, 22600, -2000, -480)
    layer('EastShoulder', 14000, 2000, 3300, 23500, -1900, -350)
    layer('NaveFoundation', 0, 3400, 8640, 11000, -1100, -80, 'StoneDark')
    layer('ApseFoundation', 0, 9900, 6550, 4100, -1250, -80, 'StoneDark')
    layer('ChapelFoundation', 0, -7000, 3450, 3280, -800, -80, 'StoneDark')
    layer('ArrivalFoundation', 0, -9500, 2830, 2300, -700, -80, 'StoneDark')
    layer('GraveyardSoil', 5500, -6450, 5900, 3700, -640, -90, 'Earth')
    layer('GraveyardEastTerrace', 10000, -6500, 3500, 4900, -700, -100, 'Earth')
    layer('SouthBurials', 5500, -9500, 6000, 3100, -700, -100, 'Earth')
    layer('WestMonasterySoil', -8700, -1500, 6500, 11700, -800, -100, 'Earth')
    # Low retaining courses have their top under the existing walkable surfaces.
    for side in (-1, 1):
        for i in range(7):
            layer(f'NaveFooting_{side}_{i}', side*4260, -1100+i*1660, 230, 1540, -600, -90, 'StoneDark')
        layer(f'ChapelFooting_{side}', side*1790, -7000, 180, 3300, -510, -90, 'Stone')
    # Rosaria's elevated room has stone load paths all the way to the site.
    for i, x in enumerate((-9930, -7670)):
        for j, y in enumerate((8380, 10300)):
            mesh(f'RosariaSubstructure_{i}_{j}', '10 Site Earth and Rock', (x, y, 1310), (530, 640, 2820))
            mesh(f'RosariaPierFoot_{i}_{j}', '10 Site Earth and Rock', (x, y, 50), (840, 890, 300))

    for i in range(34):
        angle = 2*math.pi*i/34
        x, y = -300 + 14300*math.cos(angle), 1100 + 15900*math.sin(angle)
        width, depth, height = rng.uniform(1500, 3000), rng.uniform(1100, 2300), rng.uniform(1700, 3000)
        # Edge rocks attach below the apron instead of becoming floating boulders.
        mesh(f'CliffShoulder_{i:02}', '10 Site Earth and Rock', (x, y, -850),
             (width, depth, height), 'Rock', (rng.uniform(-12, 12), math.degrees(angle)+rng.uniform(-20, 20), rng.uniform(-12, 12)),
             'Cube' if i % 3 else 'Sphere')

    # Gravestones follow burial clusters rather than uniform scenery noise.
    grave_positions = []
    for ox, oy, cols, rows in [(3500, -9300, 6, 3), (8600, -8100, 4, 4), (2700, -4700, 3, 4)]:
        for ix in range(cols):
            for iy in range(rows):
                x, y = ox+ix*580+rng.uniform(-55, 55), oy+iy*630+rng.uniform(-60, 60)
                if is_clear(x, y, 285):
                    grave_positions.append((x, y))
    for i, (x, y) in enumerate(grave_positions):
        yaw, height = rng.uniform(-14, 14), rng.uniform(160, 285)
        base = -100
        region = '11 Cemetery and Mausoleums'
        mesh(f'Burial_{i:02}_Bed', region, (x, y, base+22), (265, 450, 44), 'StoneDark', (0, yaw, 0))
        mesh(f'Burial_{i:02}_Lid', region, (x, y, base+53), (230, 415, 22), 'Stone', (0, yaw, 0))
        mesh(f'Burial_{i:02}_Head', region, (x, y+185, base+height/2+44), (130, 48, height), 'Stone', (0, yaw, rng.uniform(-5, 5)))
        if i % 3 == 0:
            mesh(f'Burial_{i:02}_Crossbar', region, (x, y+185, base+height*.8+44), (235, 54, 45), 'Trim', (0, yaw, 0))
        clearance.append(dict(name=f'Burial_{i:02}', location=[x,y], radius=285))

    for i, (x, y, w, d, h) in enumerate([(10600,-5700,1250,1600,1350), (9600,-3300,1500,1900,1700), (10300,-9700,1000,1250,1200)]):
        region = '11 Cemetery and Mausoleums'
        mesh(f'Mausoleum_{i}_Plinth', region, (x,y,-15), (w+260,d+260,170), 'StoneDark')
        mesh(f'Mausoleum_{i}_Chamber', region, (x,y,70+h/2), (w,d,h), 'Stone')
        mesh(f'Mausoleum_{i}_Cornice', region, (x,y,70+h+55), (w+150,d+150,110), 'Trim')
        for side in (-1,1):
            mesh(f'Mausoleum_{i}_Roof_{side}', region, (x+side*w*.24,y,h+70+w*.16),
                 (w*.61,d+160,110), 'StoneDark', (side*-32,0,0))
            mesh(f'Mausoleum_{i}_FrontPillar_{side}', region, (x+side*w*.36,y-d/2-35,70+h/2),
                 (110,100,h), 'Trim')
        mesh(f'Mausoleum_{i}_Recess', region, (x,y-d/2-2,70+h*.36), (w*.36,22,h*.7), 'StoneDark')
        mesh(f'Mausoleum_{i}_CrossShaft', region, (x,y,h+w*.4+150), (58,65,310), 'Trim')
        mesh(f'Mausoleum_{i}_CrossArm', region, (x,y,h+w*.4+210), (220,65,50), 'Trim')

    # Approach walls and burial enclosure: broken courses, caps, and short rails.
    for side in (-1,1):
        x=side*1900
        for i in range(4):
            y=-11800+i*560
            h=(370,510,230,610)[i]
            mesh(f'ApproachWall_{side}_{i}', '12 Ruined Boundaries', (x,y,-100+h/2), (220,490,h), 'StoneDark')
            mesh(f'ApproachCap_{side}_{i}', '12 Ruined Boundaries', (x,y,-100+h+35), (260,500,70), 'Stone')
        mesh(f'ApproachGatePier_{side}', '12 Ruined Boundaries', (side*1600,-11200,550), (370,370,1300), 'Stone')
        mesh(f'ApproachGateCap_{side}', '12 Ruined Boundaries', (side*1600,-11200,1240), (460,460,90), 'Trim')
    for i in range(13):
        x, y = 2500+i*580, -11200
        mesh(f'CemeteryBoundary_{i}_Pier', '12 Ruined Boundaries', (x,y,110), (115,135,420), 'Stone')
        mesh(f'CemeteryBoundary_{i}_Cap', '12 Ruined Boundaries', (x,y,340), (160,180,45), 'Trim')
        if i not in (3,7,12):
            mesh(f'CemeteryBoundary_{i}_Rail', '12 Ruined Boundaries', (x+290,y,200), (490,80,80), 'StoneDark')
    for i,(x,y) in enumerate([(-7100,-7900),(-7800,-7900),(-8500,-7900),(11100,-2000),(11100,-800),(11100,400)]):
        height=500+rng.uniform(0,220)
        mesh(f'RuinFragment_{i}', '12 Ruined Boundaries', (x,y,-100+height/2),
             (620,240,height), 'StoneDark', (0,rng.uniform(-8,8),0))

    # Twenty-four tree silhouettes use connected, tapering limbs, and forked ends.
    tree_sites = [(-3100,-11900), (2900,-12300), (6400,-12300), (8900,-11300),
                  (10900,-8600), (11700,-6400), (8800,-4900), (9400,-1600),
                  (-7200,-10500), (-7100,-4900), (-9400,-7000), (-10800,-3800),
                  (-11200,300), (-11800,3700), (-11100,7500), (-12300,11100),
                  (-7600,12700), (-4200,13400), (1100,13900), (5000,13100),
                  (8600,11000), (10700,7200), (10900,3400), (12300,900)]
    for i,(x,y) in enumerate(tree_sites):
        assert is_clear(x,y,1100), ('tree route exclusion', i)
        height=rng.uniform(1000,1850)
        radius=rng.uniform(52,87)
        lean=(rng.uniform(-height*.12,height*.12),rng.uniform(-height*.12,height*.12))
        nodes=[(x,y,-100)]
        for j in range(1,4):
            nodes.append((x+lean[0]*j/3,y+lean[1]*j/3,-100+height*j/3))
            branch(f'Tree_{i:02}_Trunk_{j}',nodes[j-1],nodes[j],radius*(1.15-j*.21))
        for j in range(4):
            angle=j*math.pi/2+rng.uniform(-.45,.45)
            start=nodes[1 if j<2 else 2]
            reach=height*rng.uniform(.32,.46)
            mid=(start[0]+math.cos(angle)*reach*.52,start[1]+math.sin(angle)*reach*.52,start[2]+height*.19)
            end=(start[0]+math.cos(angle)*reach,start[1]+math.sin(angle)*reach,start[2]+height*rng.uniform(.34,.46))
            branch(f'Tree_{i:02}_Limb_{j}_A',start,mid,radius*.50)
            branch(f'Tree_{i:02}_Limb_{j}_B',mid,end,radius*.27)
            fork=(mid[0]+math.cos(angle+.65)*reach*.55,mid[1]+math.sin(angle+.65)*reach*.55,mid[2]+height*.3)
            branch(f'Tree_{i:02}_Twig_{j}',mid,fork,radius*.16)
        for j in range(3):
            angle=2*math.pi*j/3+rng.random()
            branch(f'Tree_{i:02}_Root_{j}', (x,y,5), (x+math.cos(angle)*170,y+math.sin(angle)*170,-90),radius*.68)
        clearance.append(dict(name=f'Tree_{i:02}',location=[x,y],radius=1100))

    labels=[a['label'] for a in actors]
    assert len(labels)==len(set(labels))
    assert 450 <= len(actors) <= 800, len(actors)
    for actor in actors:
        assert all(math.isfinite(v) for key in ('location','size','rotation') for v in actor[key])
        assert all(v>0 for v in actor['size'])
    assert all(is_clear(*item['location'],item['radius']) for item in clearance)
    return dict(schema='cathedral-grounds-v2',target_level=source['target_level'],origin=source['origin'],
                actors=actors,assumptions=[
                    'Exterior image informed barren branching trees, graveyard density, massive stone foundations and ruined boundaries.',
                    'Site dimensions and tree placement are an interpretation, not a measured reconstruction of the original game.',
                    'Existing fourteen traversal routes and stairs are not replaced; all tree limbs are non-colliding scenery.',
                    'Earth terraces terminate at least 80 cm below the authored z=0 floor. Exposed cliff rocks are outside the route network.',
                    'No gameplay components, doors, enemies, scripted interactions, or additional playable connections are added.'],
                validation=dict(actor_count=len(actors),tree_count=len(tree_sites),grave_count=len(grave_positions),
                                route_exclusion_checks=len(clearance),route_clearance_cm=350,
                                finite_positive_dimensions=True,terrain_top_limit_cm=-80),
                source_reference='references/wikidot-exterior.jpg')


if __name__ == '__main__':
    plan=build_plan()
    OUTPUT.write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(plan['validation'],ensure_ascii=False))
