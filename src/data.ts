// All site copy lives here.

export const profile = {
  name: 'Ryan Keith',
  role: 'Software Engineer',
  focus: ['full-stack', 'geospatial', 'AI-powered'],
  location: 'Kansas City, Kansas',
  company: 'AMGRAF, Inc.',
  school: 'The University of Kansas',
  intro:
    'I build complete systems: interactive front ends, reliable APIs, spatial databases and AI features that run real queries instead of guessing. My work spans web apps, GIS platforms and machine learning on satellite imagery.',
}

export const contact = {
  email: 'ryan12keith@gmail.com',
  phone: '(872) 246-5693',
  phoneHref: 'tel:+18722465693',
  telegram: '@rhino_234',
  telegramHref: 'https://t.me/rhino_234',
  linkedin: 'https://www.linkedin.com/in/ryan-keith-91a756444/',
  github: 'https://github.com/ryan12keith-eng',
  resumePage: 'resume.html',
  resumePdf: 'Ryan_Keith_Resume.pdf',
}

export type Tag = 'gis' | 'ai' | 'web'

export const tagLabels: Record<Tag, string> = {
  gis: 'GIS',
  ai: 'AI / ML',
  web: 'Full-stack',
}

/** The role, derived from what the six projects actually require. */
export const roleTracks = [
  {
    id: 'fullstack',
    color: 'blue',
    title: 'Full-Stack Engineering',
    text: 'React + TypeScript front ends, REST APIs in FastAPI and Express, auth, validation and relational data.',
    skills: ['React', 'TypeScript', 'FastAPI', 'Node.js', 'PostgreSQL', 'REST', 'JWT auth', 'Docker'],
    projects: ['geomind', 'printflow', 'job-tracker', 'quote-assistant'],
  },
  {
    id: 'gis',
    color: 'lime',
    title: 'WebGIS & Spatial Data',
    text: 'Interactive maps, spatial SQL and geoprocessing: buffers, intersections, density, parcels and zoning.',
    skills: ['MapLibre GL JS', 'PostGIS', 'GeoPandas', 'Shapely', 'Rasterio', 'OpenStreetMap', 'Sentinel-2'],
    projects: ['geomind', 'landscope', 'earthwatch'],
  },
  {
    id: 'ai',
    color: 'coral',
    title: 'Applied AI & Machine Learning',
    text: 'LLM assistants that call real backend tools, RAG over source documents, and computer vision on imagery.',
    skills: ['LLM tool calling', 'RAG', 'PyTorch', 'YOLO', 'Segment Anything', 'scikit-learn', 'Pydantic'],
    projects: ['geomind', 'landscope', 'earthwatch', 'quote-assistant', 'job-tracker'],
  },
  {
    id: 'product',
    color: 'violet',
    title: 'Workflow & Product Systems',
    text: 'Software for real operations: role-based access, audit history, file pipelines and tested business rules.',
    skills: ['Role-based access', 'Audit logs', 'S3 storage', 'Business rules', 'Unit testing', 'Email alerts'],
    projects: ['printflow', 'quote-assistant', 'job-tracker'],
  },
]

export const rolesFit = ['Software Engineer', 'Full-Stack Developer', 'WebGIS Engineer', 'GIS Developer', 'AI Engineer']

export type Credit = { author: string; license: string; licenseUrl?: string; source: string }

export type Photo = { src: string; alt: string; caption: string; credit: Credit }

export type Project = {
  id: string
  name: string
  subtitle: string
  tags: Tag[]
  level: string
  image: string
  imageAlt: string
  credit: Credit
  summary: string
  highlights: string[]
  stack: string[]
  /** Live demo built from projects/<id>/ */
  demo: string
  /** Source folder on GitHub */
  source: string
}

const REPO = 'https://github.com/ryan12keith-eng/portfolio/tree/main/projects/'
const links = (id: string) => ({ demo: `projects/${id}/`, source: REPO + id })

export const projects: Project[] = [
  {
    id: 'geomind',
    ...links('geomind'),
    name: 'GeoMind AI',
    subtitle: 'Smart City Intelligence Platform',
    tags: ['gis', 'ai', 'web'],
    level: 'Flagship',
    image: 'images/projects/geomind.webp',
    imageAlt: 'Aerial view of a city with a river, downtown towers and surrounding neighborhoods.',
    credit: {
      author: 'Amadscientist',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      source: 'https://commons.wikimedia.org/wiki/File:Aerial_view_of_the_city_of_Sacramento.jpg',
    },
    summary:
      'A web GIS platform that helps city planners and engineers understand urban development, find infrastructure gaps and estimate future risks.',
    highlights: [
      'Interactive map of buildings, roads, parcels, land use and zoning',
      'Spatial analysis: distances, buffers, intersections and density',
      'Natural-language assistant that runs real spatial SQL',
      'Satellite analysis and flood and heat-risk estimates',
    ],
    stack: ['React', 'TypeScript', 'MapLibre', 'FastAPI', 'PostGIS', 'GeoPandas', 'PyTorch', 'LLM API'],
  },
  {
    id: 'landscope',
    ...links('landscope'),
    name: 'LandScope AI',
    subtitle: 'Real Estate & Land Intelligence',
    tags: ['gis', 'ai', 'web'],
    level: 'Advanced',
    image: 'images/projects/landscope.webp',
    imageAlt: 'Aerial photo of a new housing development with curving roads surrounded by farm fields.',
    credit: {
      author: 'Chris (geograph.org.uk)',
      license: 'CC BY-SA 2.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      source: 'https://commons.wikimedia.org/wiki/File:New_housing_development_south_of_Sleaford,_aerial_2025_-_geograph.org.uk_-_8081026.jpg',
    },
    summary:
      'A GIS platform for developers, investors and planners to evaluate land parcels and find development opportunities.',
    highlights: [
      'Parcel boundaries, dimensions, areas and zoning classes on the map',
      'Suitability score from configurable criteria: size, road access, utilities, slope',
      'Assistant explains zoning from verified source documents and compares parcels',
      'Development scenarios and missing-infrastructure reports',
    ],
    stack: ['React', 'MapLibre', 'FastAPI', 'PostGIS', 'RAG', 'scikit-learn'],
  },
  {
    id: 'earthwatch',
    ...links('earthwatch'),
    name: 'EarthWatch AI',
    subtitle: 'Environmental Monitoring & Disaster Intelligence',
    tags: ['gis', 'ai'],
    level: 'Research',
    image: 'images/projects/earthwatch.webp',
    imageAlt: 'Satellite image of a river in flood, with brown floodwater spreading through green forest to the coast.',
    credit: {
      author: 'NASA Earth Observatory (Wanmei Liang, Landsat data)',
      license: 'Public domain',
      source: 'https://commons.wikimedia.org/wiki/File:Tanzania_flood_rufiji_river_on_20240429.jpg',
    },
    summary:
      'Combines satellite imagery, environmental datasets and machine learning to monitor change and flag potential hazards.',
    highlights: [
      'Flood mapping of historical and modeled flood-prone areas',
      'NDVI vegetation monitoring and land-cover segmentation',
      'Wildfire risk from vegetation, weather and terrain factors',
      'Change detection across years of Sentinel-2 imagery',
    ],
    stack: ['Python', 'Sentinel-2', 'Earth Engine', 'Rasterio', 'PyTorch', 'Time series'],
  },
  {
    id: 'job-tracker',
    ...links('job-tracker'),
    name: 'Job Application Tracker',
    subtitle: 'AI-assisted career dashboard',
    tags: ['web', 'ai'],
    level: 'Full-stack',
    image: 'images/projects/job-tracker.webp',
    imageAlt: 'Close-up of a laptop screen showing code.',
    credit: {
      author: 'Negative Space',
      license: 'CC0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      source: 'https://commons.wikimedia.org/wiki/File:Laptop_Programmcode.jpg',
    },
    summary: 'One dashboard for every application and deadline, with short summaries of job postings and suggested resume skills.',
    highlights: [
      'Validated forms for company, role, status and deadline',
      'Status pipeline: Applied, Interview, Offer, Rejected',
      'Paste a posting to get a summary and suggested skills',
      'Hashed-password login; each user sees only their own data',
    ],
    stack: ['React', 'TypeScript', 'Node.js', 'Express', 'PostgreSQL', 'LLM API'],
  },
  {
    id: 'printflow',
    ...links('printflow'),
    name: 'PrintFlow',
    subtitle: 'Print Job & Proof Portal',
    tags: ['web'],
    level: 'Full-stack',
    image: 'images/projects/printflow.webp',
    imageAlt: 'A four-color offset printing press in a print shop.',
    credit: {
      author: 'Romain Salomon',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      source: 'https://commons.wikimedia.org/wiki/File:Offset_press_4_color.jpg',
    },
    summary: 'Customers upload artwork, approve proofs online and follow each print job from prepress to shipping.',
    highlights: [
      'Artwork uploads checked for type and size before storage',
      'Status board: Prepress, Proof, Press, Finishing, Shipped',
      'Proof approval with comments and full audit history',
      'Role-based access for customers, CSRs and production staff',
    ],
    stack: ['React', 'TypeScript', 'Express', 'PostgreSQL', 'S3', 'JWT auth'],
  },
  {
    id: 'quote-assistant',
    ...links('quote-assistant'),
    name: 'Smart Quote Assistant',
    subtitle: 'From messy emails to print specs',
    tags: ['web', 'ai'],
    level: 'Full-stack',
    image: 'images/projects/quote-assistant.webp',
    imageAlt: 'A large digital printing press on a production floor.',
    credit: {
      author: 'Coylegenec',
      license: 'CC BY-SA 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      source: 'https://commons.wikimedia.org/wiki/File:Digital_Printing_Press.JPG',
    },
    summary: 'Turns quote request emails and PDFs into structured print specs that an estimator reviews and approves.',
    highlights: [
      'Extracts quantity, size, stock, colors, finishing and due date',
      'Estimator reviews highlighted fields before saving',
      'Prices come from unit-tested business rules in code',
      'Tested against an eval set of real sample requests',
    ],
    stack: ['React', 'Python', 'FastAPI', 'PostgreSQL', 'Pydantic', 'LLM API'],
  },
]

/** Deep-dive content for the flagship project. */
export const flagship = {
  objectives: [
    'Display buildings, roads, land use, zoning and infrastructure on an interactive map',
    'Identify areas with high population density and too few public services',
    'Analyze satellite imagery to detect urban development',
    'Estimate potential infrastructure and environmental risks',
    'Let users ask geographic questions in plain language',
  ],
  capabilities: [
    {
      key: 'A',
      title: 'Natural-language GIS assistant',
      text: 'Turns a question into a structured GIS operation, runs it through the backend and explains the result.',
      examples: ['Show all schools within 5 km of this location', 'Which neighborhoods have the highest building density?', 'Population within 2 km of a hospital'],
    },
    {
      key: 'B',
      title: 'Satellite image intelligence',
      text: 'Computer vision on satellite imagery to map how the city is changing.',
      examples: ['Detect buildings from imagery', 'Classify vegetation and water', 'Compare years to detect urban expansion'],
    },
    {
      key: 'C',
      title: 'Predictive analytics',
      text: 'Machine-learning models that produce estimates for planning.',
      examples: ['Flood susceptibility', 'Urban heat risk', 'Areas with inadequate public services'],
    },
  ],
  stack: [
    ['Frontend', 'React + TypeScript'],
    ['Map', 'MapLibre GL JS'],
    ['GIS backend', 'Python + FastAPI'],
    ['Spatial database', 'PostgreSQL + PostGIS'],
    ['GIS processing', 'GeoPandas + Shapely'],
    ['AI', 'LLM API + tool calling'],
    ['Machine learning', 'PyTorch · YOLO · SAM · scikit-learn'],
    ['Visualization', 'MapLibre + Recharts'],
    ['Deployment', 'Docker + AWS or Render'],
  ],
  architecture: {
    client: { title: 'React + MapLibre', text: 'Map · dashboards · assistant' },
    api: { title: 'FastAPI backend', text: 'REST API · auth · GIS services · AI orchestration' },
    services: [
      { title: 'PostGIS', text: 'Spatial data and queries', icon: 'database' },
      { title: 'AI engine', text: 'LLM · ML · computer vision', icon: 'spark' },
      { title: 'GIS processing', text: 'GeoPandas · Rasterio', icon: 'globe' },
      { title: 'Data sources', text: 'OSM · Sentinel · open data', icon: 'satellite' },
    ],
    principle: 'The assistant never invents geographic answers. It calls real backend functions, runs spatial SQL and explains verified results.',
  },
  dataSources: [
    ['OpenStreetMap', 'Roads, buildings, amenities', 'https://www.openstreetmap.org'],
    ['Copernicus Data Space', 'Sentinel satellite imagery', 'https://dataspace.copernicus.eu'],
    ['Google Earth Engine', 'Imagery processing', 'https://earthengine.google.com'],
    ['Natural Earth', 'Boundaries and base data', 'https://www.naturalearthdata.com'],
    ['WorldPop', 'Population distribution', 'https://www.worldpop.org'],
  ],
  roadmap: [
    ['Foundation', 'React, FastAPI, PostgreSQL/PostGIS, Docker and GitHub'],
    ['GIS mapping', 'MapLibre with OpenStreetMap buildings and roads'],
    ['Spatial analysis', 'Buffers, intersections, areas, density and spatial queries'],
    ['Dashboard', 'Charts, filters, map layers and geographic statistics'],
    ['AI assistant', 'LLM with tools that execute GIS queries'],
    ['Machine learning', 'Satellite image classification or building detection'],
    ['Advanced features', 'Authentication, report generation and saved analyses'],
    ['Deployment', 'Live deploy, documentation, screenshots and demo video'],
  ],
}

export const steps = [
  { title: 'Understand', text: 'Requirements and the people who will use it.' },
  { title: 'Break down', text: 'Small parts, and a plan for how they connect.' },
  { title: 'Build', text: 'Small, working increments.' },
  { title: 'Test & debug', text: 'Fix the root cause, not the symptom.' },
  { title: 'Document', text: 'Clear docs and maintainable code.' },
]

export const questions = [
  {
    q: "How do you debug a problem you can't reproduce right away?",
    a: 'Collect logs, timestamps, browser and environment details; add targeted logging; compare failing and working cases; reproduce in staging with similar data; fix the root cause and add a regression test.',
  },
  {
    q: 'How would you design a REST API for creating and updating records?',
    a: 'POST /api/v1/records returns 201; GET /records/:id; PUT or PATCH /records/:id to update. Validate the body, require auth, and return clear 400/404/409 errors in consistent JSON.',
  },
  {
    q: 'When would you use SQL instead of NoSQL?',
    a: 'SQL for related data that needs joins, transactions and a strict schema. With PostGIS it also handles spatial queries. NoSQL for flexible documents, very high scale, or simple key lookups and caching.',
  },
  {
    q: 'How do you run a "within 5 km" query efficiently?',
    a: 'Store geometries in PostGIS with a GiST index, use ST_DWithin on geography (or a projected CRS in meters) so the index is used, and return GeoJSON the map can render directly.',
  },
  {
    q: 'How would you reduce incorrect answers from an AI model?',
    a: 'Give it the right context (RAG), have it call real tools instead of guessing, check structured output against a schema, keep a human review step where it matters, and measure with an eval set.',
  },
  {
    q: 'How would you protect API keys and user data?',
    a: 'Keys only on the server in environment variables or a secret manager, never in frontend code or git, and rotated. HTTPS, hashed passwords, least privilege, rate limits, and send models only the data they need.',
  },
]

export const values = ['Structured problem-solving', 'Continuous learning', 'Collaboration', 'Maintainable code']

const cc = (author: string, license: string, licenseUrl: string | undefined, source: string): Credit => ({ author, license, licenseUrl, source })
const BYSA4 = 'https://creativecommons.org/licenses/by-sa/4.0'
const BYSA3 = 'https://creativecommons.org/licenses/by-sa/3.0'
const BY4 = 'https://creativecommons.org/licenses/by/4.0'
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/'
const commons = 'https://commons.wikimedia.org/wiki/File:'

/** Extra real photos shown alongside each project's cover image. */
export const gallery: Record<string, Photo[]> = {
  geomind: [
    { src: 'images/projects/geomind-2.webp', alt: '3D city model of London with extruded buildings along the river.', caption: '3D city model from photogrammetry',
      credit: cc('AccuCities', 'CC BY-SA 4.0', BYSA4, commons + 'Photogrammetry_3D_city_model_of_London.jpg') },
    { src: 'images/projects/geomind-3.webp', alt: 'Kansas City skyline behind Union Station.', caption: 'Kansas City skyline',
      credit: cc('S300896', 'CC BY-SA 4.0', BYSA4, commons + 'Kansas_City_Skyline_2.JPG') },
  ],
  landscope: [
    { src: 'images/projects/landscope-2.webp', alt: 'A framed municipal zoning map with colored zoning districts.', caption: 'Municipal zoning map',
      credit: cc('Ktkvtsh', 'CC BY 4.0', BY4, commons + '2012_Tallulah_Zoning_Map.jpg') },
    { src: 'images/projects/landscope-3.webp', alt: 'Aerial view of suburban housing developments around a reservoir.', caption: 'Suburban growth around a reservoir',
      credit: cc('Carol M. Highsmith', 'Public domain', undefined, commons + 'Aerial_view_of_Geist_Reservoir_and_surrounding_housing_developments_in_Indianapolis_suburb_of_Fishers,_Indiana.jpg') },
  ],
  earthwatch: [
    { src: 'images/projects/earthwatch-2.webp', alt: 'Satellite image of the same river basin before the flood, mostly green.', caption: 'Same basin before the flood (2023)',
      credit: cc('NASA Earth Observatory (Wanmei Liang, Landsat data)', 'Public domain', undefined, commons + 'Tanzania_before_flood_rufiji_river_on_20230505.jpg') },
    { src: 'images/projects/earthwatch-3.webp', alt: 'NDVI map of circular irrigated fields in shades of green.', caption: 'NDVI of irrigated fields',
      credit: cc('Tomchenko Olha', 'CC BY 4.0', BY4, commons + 'NDVI_of_irrigated_fields.jpg') },
  ],
  'job-tracker': [
    { src: 'images/projects/job-tracker-2.webp', alt: 'Hands typing on a laptop showing code at a bright desk.', caption: 'Building the dashboard',
      credit: cc('Crew', 'CC0', CC0, commons + 'Programmer_at_work_(Unsplash).jpg') },
    { src: 'images/projects/job-tracker-3.webp', alt: 'A kanban board with To Do, Doing and Done columns of sticky notes.', caption: 'Status pipeline, kanban style',
      credit: cc('Jeff.lasovski', 'CC BY-SA 3.0', BYSA3, commons + 'Simple-kanban-board-.jpg') },
  ],
  printflow: [
    { src: 'images/projects/printflow-2.webp', alt: 'Press operators checking printed sheets beside an offset press.', caption: 'Press check on printed sheets',
      credit: cc('David Peters', 'CC BY-SA 3.0', BYSA3, commons + 'Offset_printing_at_Watermark_Press,_San_Francisco,_California.jpg') },
    { src: 'images/projects/printflow-3.webp', alt: 'Control desk of an offset printing press.', caption: 'Press control desk',
      credit: cc('Aatu Dorochenko', 'CC BY-SA 4.0', BYSA4, commons + 'Offset_printing_press_2.jpg') },
  ],
  'quote-assistant': [
    { src: 'images/projects/quote-assistant-2.webp', alt: 'Open cans of yellow and magenta offset printing ink.', caption: 'Process inks: yellow and magenta',
      credit: cc('Julo', 'Public domain', undefined, commons + 'Yellow%26Magenta_coldset_offset_inks.JPG') },
    { src: 'images/projects/quote-assistant-3.webp', alt: 'Hands typing on a laptop keyboard.', caption: 'Quote requests arrive by email',
      credit: cc('Thomas Lefebvre', 'CC0', CC0, commons + 'Typing_on_a_mac_(Unsplash).jpg') },
  ],
}

/** Cover + gallery photos for a project, in display order. */
export const photosFor = (p: Project): Photo[] => [{ src: p.image, alt: p.imageAlt, caption: p.subtitle, credit: p.credit }, ...(gallery[p.id] ?? [])]
