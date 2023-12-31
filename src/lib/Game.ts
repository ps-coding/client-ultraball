export type Game = {
	id: number;
	players: Player[];
	host: Player;
	cap: number;
	gameStarted: boolean;
	gameEnded: boolean;
	playersMoved: number[];
	lastPlayerKeepsPlaying: boolean;
	isPublic: boolean;
};

export type Player = {
	id: number;
	socket: WebSocket;
	name: string;
	isDead: boolean;
	bot: boolean;
	move?: Move;
	reloads: {
		knife: number;
		ball: number;
		bazooka: number;
		spiral: number;
	};
};

export type Move = {
	action: (typeof moves)[number];
	direction?: Player;
	using?: {
		amount: number;
		edition: 'knife' | 'ball' | 'bazooka' | 'spiral';
	}[];
};

export const moves = [
	{
		id: 'shotgun',
		title: 'Shotgun',
		method: 'offense',
		needs: null,
		beats: ['knife', 'spiralball'],
		dir: 'one',
		icon: '🔫',
		iconFlipHorizontal: true,
		iconFlipVertical: false,
		rotateIcon: 0
	},
	{
		id: 'knife',
		title: 'Knife',
		method: 'offense',
		needs: { amount: 1, edition: 'knife' },
		beats: [],
		dir: 'one',
		icon: '🔪',
		iconFlipHorizontal: false,
		iconFlipVertical: true,
		rotateIcon: 0
	},
	{
		id: 'waterball',
		title: 'Water Ball',
		method: 'offense',
		needs: { amount: 1, edition: 'ball' },
		beats: ['shotgun', 'knife', 'fireball'],
		dir: 'one',
		icon: '💧',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: 90
	},
	{
		id: 'iceball',
		title: 'Ice Ball',
		method: 'offense',
		needs: { amount: 1, edition: 'ball' },
		beats: ['shotgun', 'knife', 'waterball'],
		dir: 'one',
		icon: '❄️',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: 0
	},
	{
		id: 'fireball',
		title: 'Fire Ball',
		method: 'offense',
		needs: { amount: 2, edition: 'ball' },
		beats: ['shotgun', 'knife', 'iceball'],
		dir: 'one',
		icon: '🔥',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: -90
	},
	{
		id: 'bazooka',
		title: 'Bazooka',
		method: 'offense',
		needs: { amount: 3, edition: 'bazooka' },
		beats: ['shotgun', 'knife', 'waterball', 'iceball', 'fireball'],
		dir: 'one',
		icon: '🚀',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: 0
	},
	{
		id: 'spiralball',
		title: 'Spiral Ball',
		method: 'offense',
		needs: { amount: 5, edition: 'spiral' },
		beats: ['knife', 'waterball', 'iceball', 'fireball', 'bazooka'],
		dir: 'one',
		icon: '🌀',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: 0
	},
	{
		id: 'deathsmoke',
		title: 'Death Smoke',
		method: 'offense',
		needs: { amount: 10, edition: 'any' },
		beats: ['shotgun', 'knife', 'waterball', 'iceball', 'fireball', 'bazooka', 'spiralball'],
		dir: 'all',
		icon: '☠️',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: 0
	},
	{
		id: 'shield',
		title: 'Shield',
		method: 'defense',
		defends: ['shotgun', 'knife', 'waterball', 'iceball', 'fireball', 'bazooka'],
		penetrates: ['spiralball', 'deathsmoke'],
		dir: 'all',
		icon: '🛡️',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: 0
	},
	{
		id: 'mirror',
		title: 'Mirror',
		method: 'defense-offense',
		reflects: ['shotgun', 'waterball', 'iceball'],
		penetrates: ['knife', 'fireball', 'bazooka', 'spiralball', 'deathsmoke'],
		dir: 'one',
		icon: '🪞',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: 0
	},
	{
		id: 'mask',
		title: 'Mask',
		method: 'defense',
		defends: ['deathsmoke'],
		penetrates: ['shotgun', 'knife', 'waterball', 'iceball', 'fireball', 'bazooka', 'spiralball'],
		dir: 'all',
		icon: '😷',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: 0
	},
	{
		id: 'r-knife',
		title: 'Knife Sheath',
		method: 'reload',
		amount: 1,
		dir: 'self',
		for: ['knife', 'deathsmoke'],
		icon: '🔪',
		iconFlipHorizontal: true,
		iconFlipVertical: false,
		rotateIcon: 0
	},
	{
		id: 'r-ball',
		title: 'Ball Power',
		method: 'reload',
		amount: 1,
		dir: 'self',
		for: ['waterball', 'iceball', 'fireball', 'deathsmoke'],
		icon: '🔮',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: 0
	},
	{
		id: 'r-bazooka',
		title: 'Bazooka Reload',
		method: 'reload',
		amount: 1,
		dir: 'self',
		for: ['bazooka', 'deathsmoke'],
		icon: '🚀',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: 0
	},
	{
		id: 'r-spiral',
		title: 'Spiral Energy',
		method: 'reload',
		amount: 1,
		dir: 'self',
		for: ['spiralball', 'deathsmoke'],
		icon: '🌀',
		iconFlipHorizontal: false,
		iconFlipVertical: false,
		rotateIcon: 0
	}
] as const;
