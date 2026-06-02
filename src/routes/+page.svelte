<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { JSONRetrocycle } from '$lib/cycle';
	import type { Game, Player } from '$lib/Game';
	import { moves } from '$lib/Game';

	let ws: WebSocket;
	let game: Game;
	let isHost = false;
	let selectedMove: (typeof moves)[number] | undefined = undefined;
	let currentPlayerId: number;
	let reloadSelection: (typeof game.players)[number]['reloads'] = {
		knife: 0,
		ball: 0,
		bazooka: 0,
		spiral: 0
	};
	let against: number;

	let moveTab: 'offense' | 'defense' | 'reload' = 'offense';

	const reloadMaxes: Record<string, number> = {
		knife: 1,
		ball: 2,
		bazooka: 3,
		spiral: 5
	};

	onMount(() => {
		if (gameId && gameId != '') {
			if (window.location.pathname + window.location.search != '/?gameId=' + gameId.toString())
				history.pushState(null, '', '/?gameId=' + gameId);
		} else {
			if (window.location.pathname + window.location.search != '/')
				history.pushState(null, '', '/');
		}

		ws = new WebSocket('wss://server-ultraball.onrender.com');

		ws.onopen = () => {
			status = 'connected';
		};

		ws.onclose = () => {
			ws.close();
			status = 'results';
			if (
				bigError.substring(0, 15) != 'Removal Reason:' &&
				bigError.substring(0, 11) != 'End Reason:'
			) {
				bigError = 'Disconnected';
			}
		};

		ws.onmessage = (data) => {
			const { type, payload } = JSONRetrocycle(JSON.parse(data.data));

			if (type == 'error') {
				bigError = payload.error;
				if (searchedGames.length > 0 && (bigError == 'Game Not Found' || bigError == 'Game Full')) {
					bigError += ' (refreshing public games...)';
					ws.send(JSON.stringify({ type: 'search-games' }));
				}
				return;
			}

			if (type == 'available-games-found') {
				searchedGames = payload.availableGames;
				if (bigError == 'Game Not Found (refreshing public games...)') bigError = 'Game Not Found';
				if (bigError == 'Game Full (refreshing public games...)') bigError = 'Game Full';
				return;
			}

			bigError = '';
			game = payload.game;

			if (
				game &&
				window.location.pathname + window.location.search != '/?gameId=' + game.id.toString()
			) {
				history.pushState(null, '', '/?gameId=' + game.id.toString());
			}

			switch (type) {
				case 'game-created':
					isHost = true;
					status = 'lobby';
					break;
				case 'player-id':
					currentPlayerId = payload.playerId;
					break;
				case 'player-added':
					status = 'lobby';
					break;
				case 'game-started':
					against = game.players.filter((p) => !p.isDead && p.id != currentPlayerId)[0]?.id;
					moveTab = 'offense';
					selectedMove = undefined;
					status = 'move';
					break;
				case 'player-loaded':
					if (payload.loadedPlayerId == currentPlayerId) status = 'moved';
					break;
				case 'game-updated':
					status = 'pairings';
					showPairings();
					break;
				case 'game-ended':
					ws.close();
					stopPairings(true);
					status = 'results';
					bigError = 'End Reason: ' + getGameEndMessage(payload.reason);
					break;

				case 'player-removed':
					if (payload.removedPlayerId == currentPlayerId) {
						ws.close();
						status = 'results';
						bigError = 'Removal Reason: ' + getPlayerRemovalMessage(payload.reason);
					}
					break;
				case 'player-removed-update': {
					const remaining = game.players.filter((p) => !p.isDead && p.id != currentPlayerId);
					if (remaining.length > 0) against = remaining[0].id;
					break;
				}
			}
		};
	});

	let status:
		| 'connecting'
		| 'connected'
		| 'lobby'
		| 'move'
		| 'processing'
		| 'player-details'
		| 'moved'
		| 'pairings'
		| 'update'
		| 'results' = 'connecting';

	let name = '';
	let gameId = '';
	const gid = $page.url.searchParams.get('gameId');
	if (gid) {
		const gidInt = parseInt(gid);
		if (gidInt && !isNaN(gidInt)) gameId = gidInt.toString();
	}
	let cap = '';
	let lastPlayerKeepsPlaying = true;
	let isPublic = false;
	let searchedGames: {
		id: number;
		host: string;
		players: number;
		bots: number;
		cap: number;
		lastPlayerKeepsPlaying: boolean;
	}[] = [];

	let errorMessage = '';
	let bigError = '';
	let showCards = false;

	async function shareGameLink() {
		const url = window.location.href;

		navigator.clipboard.writeText(url);

		if (navigator.share) {
			try {
				await navigator.share({
					title: 'Join my Ultra Ball game',
					text: 'Join my game!',
					url
				});
			} catch (err) {
				// user probably cancelled
				console.log('Share cancelled', err);
			}
		} else {
			// fallback for desktop / unsupported browsers
			await navigator.clipboard.writeText(url);
			alert('Link copied to clipboard');
		}
	}

	function getGameEndMessage(reason: string) {
		switch (reason) {
			case 'host-left':
				return 'The host left the game.';
			case 'host-end':
				return 'The host ended the game.';
			case 'all-left':
				return 'The game ended because there were not enough active players remaining.';
			case 'all-dead':
				return 'All players have been eliminated.';
			default:
				return 'The game has ended.';
		}
	}

	function getPlayerRemovalMessage(reason: string) {
		switch (reason) {
			case 'host-kicked':
				return 'You were removed by the host.';
			case 'left':
				return 'You left the game.';
			default:
				return 'You were removed from the game.';
		}
	}

	function playerMoveText(player: Player) {
		if (player.move) {
			return 'Used ' + player.move.action.title + direction(player);
		} else {
			return 'Did nothing';
		}
		function direction(player: Player) {
			if (player.move?.action.dir == 'one') {
				return ' against ' + player.move?.direction?.name + ' (' + player.move?.direction?.id + ')';
			} else if (player.move?.action.dir == 'self') {
				return '';
			} else {
				return ' against everyone';
			}
		}
	}

	function reloadsArray(player: Player | undefined) {
		if (!player) return [];
		return Object.keys(player.reloads).map((key) => ({
			edition: key as keyof typeof player.reloads,
			amount: player.reloads[key as keyof typeof player.reloads]
		}));
	}

	function reloadSelectionToArray() {
		if (!reloadSelection) return undefined;
		return Object.keys(reloadSelection).map((key) => ({
			edition: key as keyof typeof reloadSelection,
			amount: reloadSelection[key as keyof typeof reloadSelection]
		}));
	}

	function hasEnoughReloads(player: Player | undefined, reload: any) {
		if (!player) return false;
		if (!reload) return true;
		return player.reloads[reload.edition as keyof typeof player.reloads] >= reload.amount;
	}

	function hasEnoughAnyReloads(player: Player | undefined, amount: number) {
		if (!player) return false;
		let sum = 0;
		for (const reload of reloadsArray(player)) sum += reload.amount;
		return sum >= amount;
	}

	function totalReloads(player: Player | undefined) {
		if (!player) return 0;
		return Object.values(player.reloads).reduce((a, b) => a + b, 0);
	}

	function forReloadsText(moveId: (typeof moves)[number]['id']) {
		const move = moves.find((m) => m.id == moveId);
		if (!move) return '';
		if (move.method != 'offense') return '';
		if (!move.needs) return '';
		if (move.needs.edition == 'any') {
			return move.title + ' (' + move.needs.amount + ' of any)';
		} else {
			return move.title + ' (' + move.needs.amount + ')';
		}
	}

	function pairings(
		game: Game
	): { player: Player; against: Player | undefined | 'everyone'; againstEachOther: boolean }[] {
		const players = game.players.filter(
			(p) => p.move && (p.move.action.method == 'offense' || p.move.action.method == 'reload')
		);
		players.sort((a, b) => {
			if (a.bot && !b.bot) return 1;
			if (!a.bot && b.bot) return -1;
			if (a.move?.action.method == 'reload' && b.move?.action.method == 'offense') return 1;
			if (a.move?.action.method == 'offense' && b.move?.action.method == 'reload') return -1;
			return 0;
		});

		const result: {
			player: Player;
			against: Player | undefined | 'everyone';
			againstEachOther: boolean;
		}[] = [];
		const used: number[] = [];

		for (const player of players) {
			if (used.includes(player.id)) continue;
			used.push(player.id);
			if (player.move?.action.dir == 'one') {
				const ag = player.move?.direction;
				if (ag) {
					if (ag.move?.action.dir == 'one' && ag.move?.direction?.id == player.id) {
						used.push(ag.id);
						result.push({ player, against: ag, againstEachOther: true });
					} else if (ag.move?.action.dir == 'all') {
						result.push({ player, against: ag, againstEachOther: true });
					} else {
						result.push({ player, against: ag, againstEachOther: false });
					}
				}
			} else if (player.move?.action.dir == 'self') {
				result.push({ player, against: undefined, againstEachOther: false });
			} else if (player.move?.action.dir == 'all') {
				result.push({ player, against: 'everyone', againstEachOther: false });
			}
		}

		result.sort((a, b) => {
			const aInvolves =
				a.player.id == currentPlayerId ||
				a.against == 'everyone' ||
				a.against?.id == currentPlayerId;
			const bInvolves =
				b.player.id == currentPlayerId ||
				b.against == 'everyone' ||
				b.against?.id == currentPlayerId;
			if (aInvolves && !bInvolves) return -1;
			if (!aInvolves && bInvolves) return 1;
			return 0;
		});

		return result;
	}

	let currentPairingIndex: number = 0;
	let pairingsInterval: ReturnType<typeof setInterval> | undefined;
	let pairing: ReturnType<typeof pairings>[number] | undefined;

	function showPairings() {
		currentPairingIndex = 0;
		if (currentPairingIndex >= pairings(game).length) {
			status = 'update';
			return;
		}
		pairing = pairings(game)[currentPairingIndex];
		currentPairingIndex++;
		pairingsInterval = setInterval(() => {
			if (currentPairingIndex >= pairings(game).length) {
				clearInterval(pairingsInterval);
				pairingsInterval = undefined;
				status = 'update';
				return;
			}
			pairing = pairings(game)[currentPairingIndex];
			currentPairingIndex++;
		}, 1000);
	}

	// skipToResults: if true, don't set status to 'update' (used when game ends during pairings)
	function stopPairings(skipToResults = false) {
		clearInterval(pairingsInterval);
		pairingsInterval = undefined;
		if (!skipToResults) status = 'update';
	}

	function submitMove() {
		if (!selectedMove) return;
		const player = game.players.find((p) => p.id == currentPlayerId);
		if (!player) return;

		const playerReloads = JSON.parse(JSON.stringify(player.reloads));
		const usingReloads = reloadSelectionToArray();

		if (usingReloads && selectedMove.method == 'offense' && selectedMove.needs?.edition == 'any') {
			let allSum = 0;
			for (const use of usingReloads) allSum += use.amount;
			if (allSum != selectedMove.needs.amount) {
				errorMessage = `'${selectedMove.title}' requires ${selectedMove.needs.amount} reloads, but you selected ${allSum}.`;
				return;
			}
			let counter = 0;
			for (const use of usingReloads) {
				if (playerReloads[use.edition] >= use.amount) {
					playerReloads[use.edition] -= use.amount;
					counter += use.amount;
				} else break;
			}
			if (counter < selectedMove.needs.amount) {
				errorMessage = "You don't have all of the reloads you selected.";
				return;
			}
		}

		// Validate target is set for targeted moves
		if (selectedMove.dir == 'one' && !against) {
			const targets = game.players.filter((p) => !p.isDead && p.id != currentPlayerId);
			if (targets.length > 0) against = targets[0].id;
		}

		status = 'processing';
		ws.send(
			JSON.stringify({
				type: 'load-move',
				payload: {
					playerId: currentPlayerId,
					moveId: selectedMove.id,
					using:
						selectedMove.method == 'offense' && selectedMove.needs?.edition == 'any'
							? reloadSelectionToArray()
							: undefined,
					direction: selectedMove.dir == 'one' ? against : undefined
				}
			})
		);

		selectedMove = undefined;
		errorMessage = '';
		reloadSelection = { knife: 0, ball: 0, bazooka: 0, spiral: 0 };
	}

	$: currentPlayer = game?.players.find((p) => p.id == currentPlayerId);
	$: availableOffenseMoves = (() => {
		const player = currentPlayer;
		if (!player) return [];

		return moves.filter((m) => {
			if (m.method !== 'offense') return false;

			// free moves (Shotgun etc.)
			if (!m.needs) return true;

			// "any reload" moves (deathsmoke)
			if (m.needs.edition === 'any') {
				return hasEnoughAnyReloads(player, m.needs.amount);
			}

			// normal costed moves (waterball, fireball, etc.)
			return hasEnoughReloads(player, m.needs);
		});
	})();
	$: availableDefenseMoves = moves.filter(
		(m) => m.method === 'defense' || m.method === 'defense-offense'
	);
	$: availableReloadMoves = moves.filter((m) => m.method === 'reload');
	$: tabMoves =
		moveTab === 'offense'
			? availableOffenseMoves
			: moveTab === 'defense'
			? availableDefenseMoves
			: availableReloadMoves;
</script>

<svelte:head>
	<title>Ultra Ball</title>
	<meta
		name="description"
		content="The traditional game of shotgun/war codified and taken to the next level with more possible moves and avenues. It's online, free, ad-free, and multiplayer, so try it out!"
	/>
	<meta
		name="keywords"
		content="ultra, ball, shotgun, war, multiplayer, game, online, free, ad-free"
	/>
	<meta property="og:title" content="Ultra Ball | Online Multiplayer Strategy Game" />
	<meta
		property="og:description"
		content="The traditional game of shotgun/war codified and taken to the next level with more possible moves and avenues."
	/>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<!-- ════════════════════════ HEADER ════════════════════════ -->
<header class="site-header">
	<a
		class="title"
		href="/about"
		target={['connecting', 'connected', 'results'].includes(status) ? '' : '_blank'}
		title="Read About Ultra Ball"
	>
		<span class="title-icon">🌀</span> Ultra Ball <small class="about-small">(about)</small>
	</a>

	{#if currentPlayerId && game}
		<div class="header-player-badge">
			<span class="badge-role">{isHost ? '👑 Host' : '🎮 Player'}</span>
			<span class="badge-name">{game.players.find((p) => p.id == currentPlayerId)?.name}</span>
			<span class="badge-id">#{currentPlayerId}</span>
		</div>
	{/if}

	<div class="header-actions">
		{#if isHost && game && !game.gameEnded && !['connecting', 'connected', 'results'].includes(status)}
			<button class="btn-danger" on:click={() => ws.send(JSON.stringify({ type: 'end-game' }))}
				>⛔ End Game</button
			>
		{:else if !isHost && game && !game.gameEnded && !['connecting', 'connected', 'results'].includes(status)}
			<button
				class="btn-danger"
				on:click={() => {
					ws.send(JSON.stringify({ type: 'leave-game', payload: { playerId: currentPlayerId } }));
					ws.close();
					status = 'results';
					bigError = 'Removal Reason: left';
				}}>🚪 Leave</button
			>
		{/if}
	</div>
</header>

<main class="main-content">
	<!-- ════════════════════════ CONNECTING ════════════════════════ -->
	{#if status === 'connecting'}
		<div class="center-screen">
			<div class="pulse-ring" />
			<h2 class="screen-title">Connecting…</h2>
			<p class="muted">The server may take ~30s to wake up on first connect. Hang tight.</p>
		</div>

		<!-- ════════════════════════ CONNECTED (lobby entry) ════════════════════════ -->
	{:else if status === 'connected'}
		<h2 class="screen-title">Enter the Arena</h2>

		<div class="entry-grid">
			<!-- Left: join -->
			<div class="panel">
				<h3 class="panel-title">⚔️ Join a Game</h3>
				<label class="field-label" for="name">Screen Name</label>
				<div class="input-row">
					<input
						class="has-clear-button"
						id="name"
						type="text"
						placeholder="Your name…"
						bind:value={name}
					/>
					<button
						class="clear-button"
						on:click={() => {
							name = '';
						}}>✕</button
					>
				</div>

				<label class="field-label" for="gameCode">Game Code</label>
				<div class="input-row">
					<input
						class="hide-arrows has-clear-button"
						id="gameCode"
						min="1"
						type="number"
						inputmode="numeric"
						placeholder="e.g. 424242"
						class:ierror={gameId &&
							(parseInt(gameId) < 1 || bigError == 'Game Not Found' || bigError == 'Game Full')}
						bind:value={gameId}
						on:keydown={(e) => {
							if (bigError == 'Game Not Found' || bigError == 'Game Full') bigError = '';
							if (e.key == 'Enter' && name && gameId && parseInt(gameId) > 0)
								ws.send(
									JSON.stringify({ type: 'join-game', payload: { name, gameId: parseInt(gameId) } })
								);
						}}
					/>
					<button
						class="clear-button"
						on:click={() => {
							if (window.location.pathname + window.location.search != '/')
								history.pushState(null, '', '/');
							gameId = '';
							if (bigError == 'Game Not Found' || bigError == 'Game Full') bigError = '';
						}}>✕</button
					>
				</div>

				<div class="btn-row">
					<button
						class="btn-primary"
						disabled={!name || !gameId || parseInt(gameId) < 1}
						on:click={() => {
							if (name && gameId && parseInt(gameId) > 0)
								ws.send(
									JSON.stringify({ type: 'join-game', payload: { name, gameId: parseInt(gameId) } })
								);
						}}>Join →</button
					>
					<button
						class="btn-secondary"
						on:click={() => ws.send(JSON.stringify({ type: 'search-games' }))}
						>🔍 Search Public</button
					>
				</div>

				{#if searchedGames.length > 0}
					<div class="public-games">
						<div class="public-games-header">
							<span>Public Games</span>
							<div>
								<button
									class="btn-xs"
									on:click={() => ws.send(JSON.stringify({ type: 'search-games' }))}>↻</button
								>
								<button class="btn-xs btn-danger-xs" on:click={() => (searchedGames = [])}>✕</button
								>
							</div>
						</div>
						{#each searchedGames as sg}
							<div class="public-game-row">
								<div class="public-game-info">
									<strong>#{sg.id}</strong> by {sg.host}
									<span class="muted">
										· {sg.players}/{sg.cap} players · {sg.bots} bot{sg.bots != 1 ? 's' : ''}</span
									>
								</div>
								<button
									class="btn-xs btn-primary-xs"
									on:click={() => {
										gameId = sg.id.toString();
										if (name && gameId && parseInt(gameId) > 0)
											ws.send(
												JSON.stringify({
													type: 'join-game',
													payload: { name, gameId: parseInt(gameId) }
												})
											);
									}}>Join</button
								>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Right: create -->
			<div class="panel">
				<h3 class="panel-title">🏗️ Create a Game</h3>
				<label class="field-label" for="name2">Screen Name</label>
				<div class="input-row">
					<input
						class="has-clear-button"
						id="name2"
						type="text"
						placeholder="Your name…"
						bind:value={name}
					/>
					<button
						class="clear-button"
						on:click={() => {
							name = '';
						}}>✕</button
					>
				</div>

				<label class="field-label" for="cap">Player Cap</label>
				<input
					id="cap"
					type="number"
					inputmode="numeric"
					min={lastPlayerKeepsPlaying ? 1 : 2}
					placeholder="e.g. 4"
					class:ierror={(cap && parseInt(cap) < (lastPlayerKeepsPlaying ? 1 : 2)) ||
						(cap && isPublic && parseInt(cap) < 2)}
					bind:value={cap}
					on:change={() => {
						if (parseInt(cap) <= 1) {
							isPublic = false;
							lastPlayerKeepsPlaying = true;
						}
					}}
					on:keydown={(e) => {
						if (
							e.key == 'Enter' &&
							name &&
							cap &&
							parseInt(cap) > 0 &&
							(lastPlayerKeepsPlaying || parseInt(cap) > 1)
						)
							ws.send(
								JSON.stringify({
									type: 'create-game',
									payload: { name, cap: parseInt(cap), lastPlayerKeepsPlaying, isPublic }
								})
							);
					}}
				/>

				<div class="toggle-group">
					<label class="toggle-label">
						<input
							type="checkbox"
							disabled={parseInt(cap) <= 1}
							bind:checked={lastPlayerKeepsPlaying}
						/>
						<span class="toggle-text"
							>Last player battles bots <small>(needed for solo)</small></span
						>
					</label>
					<label class="toggle-label">
						<input type="checkbox" disabled={parseInt(cap) <= 1} bind:checked={isPublic} />
						<span class="toggle-text">Public game</span>
					</label>
				</div>

				<button
					class="btn-primary"
					style="margin-top: 1rem;"
					disabled={!name ||
						!cap ||
						parseInt(cap) < 1 ||
						(!lastPlayerKeepsPlaying && parseInt(cap) < 2)}
					on:click={() => {
						if (name && cap && parseInt(cap) > 0 && (lastPlayerKeepsPlaying || parseInt(cap) > 1))
							ws.send(
								JSON.stringify({
									type: 'create-game',
									payload: { name, cap: parseInt(cap), lastPlayerKeepsPlaying, isPublic }
								})
							);
					}}>Create Game →</button
				>
			</div>
		</div>

		<!-- ════════════════════════ LOBBY ════════════════════════ -->
	{:else if status === 'lobby'}
		<h2 class="screen-title">Lobby</h2>

		<div class="lobby-code-bar">
			<span class="lobby-label">Game Code</span>
			<span class="lobby-code">{game.id}</span>
			{#if game.players.filter((p) => !p.bot).length > 1 || game.cap > 1}
				<button
					class="btn-icon"
					on:click={() => navigator.clipboard.writeText(game.id.toString())}
					title="Copy code">📋</button
				>
				<button class="btn-icon" on:click={shareGameLink} title="Share link">📤</button>
			{:else}
				<span class="muted">Solo mode — add bots then start!</span>
			{/if}
		</div>

		<div class="lobby-players">
			<div class="lobby-players-header">
				<span
					>Players ({game.cap == 1
						? 'solo'
						: `${game.players.filter((p) => !p.bot).length} / ${game.cap}`})</span
				>
				{#if isHost}
					<button
						class="btn-secondary btn-sm"
						on:click={() => ws.send(JSON.stringify({ type: 'add-bot' }))}>+ Add Bot</button
					>
				{/if}
			</div>
			<div class="player-list">
				{#each game.players as player}
					<div class="lobby-player-row" class:is-self={player.id == currentPlayerId}>
						<span class="player-avatar">{player.bot ? '🤖' : '🧑'}</span>
						<span class="player-lobby-name" class:self-text-blue={player.id == currentPlayerId}
							>{player.name}</span
						>
						<span class="player-id muted">#{player.id}</span>
						{#if player.id == currentPlayerId}<span class="self-badge">You</span>{/if}
						{#if isHost && player.id != currentPlayerId}
							<button
								class="btn-danger btn-sm"
								on:click={() =>
									ws.send(JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } }))}
								>Kick</button
							>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		{#if isHost}
			<button
				class="btn-primary btn-lg"
				disabled={game.players.filter((p) => !p.bot).length <= 0 ||
					(!game.lastPlayerKeepsPlaying && game.players.filter((p) => !p.bot).length <= 1) ||
					(game.players.filter((p) => p.bot).length < 1 &&
						game.players.filter((p) => !p.bot).length < 2)}
				on:click={() => ws.send(JSON.stringify({ type: 'start-game' }))}
			>
				🚀 Start Game
			</button>
		{/if}

		<!-- ════════════════════════ MOVE SELECTION ════════════════════════ -->
	{:else if status === 'move'}
		<div class="move-screen">
			<!-- Left column: move picker -->
			<div class="move-picker-col">
				<div class="move-screen-header">
					<h2 class="screen-title" style="margin:0">Your Move</h2>
					<button
						class="btn-secondary btn-sm"
						on:click={() => {
							status = 'player-details';
						}}>👥 Players</button
					>
				</div>

				<!-- Tab bar -->
				<div class="tab-bar">
					<button
						class="tab-btn"
						class:active={moveTab === 'offense'}
						on:click={() => {
							selectedMove = undefined;
							moveTab = 'offense';
						}}
					>
						⚔️ Attack <span class="tab-count">{availableOffenseMoves.length}</span>
					</button>
					<button
						class="tab-btn"
						class:active={moveTab === 'defense'}
						on:click={() => {
							selectedMove = undefined;
							moveTab = 'defense';
						}}
					>
						🛡️ Defend <span class="tab-count">{availableDefenseMoves.length}</span>
					</button>
					<button
						class="tab-btn"
						class:active={moveTab === 'reload'}
						on:click={() => {
							selectedMove = undefined;
							moveTab = 'reload';
						}}
					>
						🔄 Reload <span class="tab-count">{availableReloadMoves.length}</span>
					</button>
				</div>

				<!-- Move cards grid -->
				<div class="move-cards-grid">
					{#each tabMoves as move}
						<button
							class="move-tile"
							class:selected={selectedMove?.id === move.id}
							on:click={() => {
								selectedMove = move;
								errorMessage = '';
							}}
						>
							<span
								class="move-tile-icon"
								class:mirror-h={move.iconFlipHorizontal}
								class:mirror-v={move.iconFlipVertical}
								class:rotate-90={move.rotateIcon == 90}
								class:rotate-negative-90={move.rotateIcon == -90}>{move.icon}</span
							>
							<span class="move-tile-name">{move.title}</span>
							{#if move.method === 'offense' && move.needs}
								{#if move.needs.edition === 'any'}
									<span class="move-tile-cost">{move.needs.amount} any</span>
								{:else}
									<span class="move-tile-cost">{move.needs.amount} {move.needs.edition}</span>
								{/if}
							{/if}
						</button>
					{/each}
					{#if tabMoves.length === 0}
						<p class="muted" style="padding: 1rem; grid-column: 1/-1;">
							{moveTab === 'offense'
								? 'No attack moves available — reload first!'
								: 'No moves in this category.'}
						</p>
					{/if}
				</div>

				<!-- Target selector -->
				{#if selectedMove && selectedMove.dir === 'one'}
					<div class="target-selector">
						<label class="field-label">Target</label>
						<div class="target-buttons">
							{#each game.players.filter((p) => !p.isDead && p.id !== currentPlayerId) as player}
								<button
									class="target-btn"
									class:selected={against === player.id}
									on:click={() => {
										against = player.id;
									}}
								>
									{player.bot ? '🤖' : '🧑'}
									{player.name}
								</button>
							{/each}
						</div>
					</div>
					{#if game.players.filter((p) => p.id == against).length > 0}
						{@const againstPlayer = game.players.find((p) => p.id == against)}
						<div style="margin-top: 1rem;">
							<div class="player-card {againstPlayer.isDead ? 'dead' : 'alive'}">
								<div class="pc-header">
									<span class="pc-avatar">{againstPlayer.bot ? '🤖' : '🧑'}</span>

									<div class="pc-name-block">
										<span class="pc-name">{againstPlayer.name}</span>
										<span class="pc-id muted">#{againstPlayer.id}</span>
									</div>

									{#if againstPlayer.id === currentPlayerId}
										<span class="self-badge">You</span>
									{/if}
								</div>

								<div class="pc-status">
									{againstPlayer.isDead ? '💀 Eliminated' : '😊 Alive'}
								</div>

								{#if againstPlayer.move}
									<div class="pc-last-move">
										🎲 {playerMoveText(againstPlayer)}
									</div>
								{/if}

								<div class="pc-reloads">
									{#each reloadsArray(againstPlayer) as reload}
										<div class="pc-reload-row">
											<span class="pc-reload-label">{reload.edition}</span>

											<div class="pc-reload-pips">
												{#each Array(Math.max(reload.amount, reloadMaxes[reload.edition])) as _, i}
													<span class="pip" class:filled={i < reload.amount} />
												{/each}
											</div>

											<span class="pc-reload-num">{reload.amount}</span>
										</div>
									{/each}
								</div>
							</div>
						</div>
					{/if}
				{/if}

				<!-- Reload resource selector for death smoke -->
				{#if selectedMove && selectedMove.method == 'offense' && selectedMove.needs?.edition == 'any'}
					<div class="reload-resource-picker">
						<p class="field-label">Spend {selectedMove.needs.amount} reloads (any mix):</p>
						{#each reloadsArray(currentPlayer) as reload}
							{#if reload.amount > 0}
								<div class="resource-row">
									<label class="field-label" for="reload-{reload.edition}" style="margin-top:0">
										{reload.edition.charAt(0).toUpperCase() + reload.edition.slice(1)} (have {reload.amount})
									</label>
									<input
										type="number"
										inputmode="numeric"
										id="reload-{reload.edition}"
										min="0"
										max={reload.amount}
										bind:value={reloadSelection[reload.edition]}
									/>
								</div>
							{/if}
						{/each}
					</div>
				{/if}

				{#if errorMessage}
					<p class="error-msg">⚠️ {errorMessage}</p>
				{/if}

				<button class="btn-primary btn-lg" disabled={!selectedMove} on:click={submitMove}>
					{selectedMove
						? `${selectedMove.icon} Confirm: ${selectedMove.title}`
						: 'Select a move first'}
				</button>
			</div>

			<!-- Right column: move info + reloads -->
			<div class="move-info-col">
				<!-- Selected move detail card -->
				{#if selectedMove}
					<div class="move-detail-card">
						<div
							class="move-detail-icon"
							class:mirror-h={selectedMove.iconFlipHorizontal}
							class:mirror-v={selectedMove.iconFlipVertical}
							class:rotate-90={selectedMove.rotateIcon == 90}
							class:rotate-negative-90={selectedMove.rotateIcon == -90}
						>
							{selectedMove.icon}
						</div>
						<h3 class="move-detail-title">{selectedMove.title}</h3>
						<div class="move-detail-tags">
							<span class="tag tag-method">{selectedMove.method}</span>
							<span class="tag tag-dir">{selectedMove.dir}</span>
						</div>

						{#if selectedMove.method == 'offense' && selectedMove.needs?.edition == 'any'}
							<div class="move-stat">
								<span>Cost</span><span>{selectedMove.needs.amount} reloads (any)</span>
							</div>
						{:else if selectedMove.method == 'offense' && selectedMove.needs?.edition}
							<div class="move-stat">
								<span>Cost</span><span
									>{selectedMove.needs.amount}
									{selectedMove.needs.edition} reload{selectedMove.needs.amount != 1
										? 's'
										: ''}</span
								>
							</div>
						{:else if selectedMove.method == 'offense'}
							<div class="move-stat"><span>Cost</span><span>Free</span></div>
						{/if}

						{#if selectedMove.method == 'offense'}
							{#if selectedMove.beats.length > 0}
								<div class="move-stat">
									<span>Beats</span><span
										>{selectedMove.beats
											.map((id) => moves.find((m) => m.id == id)?.title)
											.join(', ')}</span
									>
								</div>
							{:else}
								<div class="move-stat">
									<span>Beats</span><span class="muted">No offensive moves</span>
								</div>
							{/if}
							{#if selectedMove.beaten.length > 0}
								<div class="move-stat">
									<span>Beaten by</span><span
										>{selectedMove.beaten
											.map((id) => moves.find((m) => m.id == id)?.title)
											.join(', ')}</span
									>
								</div>
							{:else}
								<div class="move-stat">
									<span>Beaten by</span><span class="muted">No offensive moves</span>
								</div>
							{/if}
							{#if selectedMove.penetrates.length > 0}
								<div class="move-stat">
									<span>Penetrates</span><span
										>{selectedMove.penetrates
											.map((id) => moves.find((m) => m.id == id)?.title)
											.join(', ')}</span
									>
								</div>
							{:else}
								<div class="move-stat">
									<span>Penetrates</span><span class="muted">No defensive moves</span>
								</div>
							{/if}
							{#if selectedMove.deflected.length > 0}
								<div class="move-stat">
									<span>Can't penetrate</span><span
										>{selectedMove.deflected
											.map((id) => moves.find((m) => m.id == id)?.title)
											.join(', ')}</span
									>
								</div>
							{:else}
								<div class="move-stat">
									<span>Can't penetrate</span><span class="muted">No defensive moves</span>
								</div>
							{/if}
						{:else if selectedMove.method == 'defense-offense'}
							<div class="move-stat">
								<span>Reflects</span><span
									>{selectedMove.reflects
										.map((id) => moves.find((m) => m.id == id)?.title)
										.join(', ')}</span
								>
							</div>
							<div class="move-stat">
								<span>Penetrated by</span><span
									>{selectedMove.penetrates
										.map((id) => moves.find((m) => m.id == id)?.title)
										.join(', ')}</span
								>
							</div>
						{:else if selectedMove.method == 'defense'}
							<div class="move-stat">
								<span>Blocks</span><span
									>{selectedMove.defends
										.map((id) => moves.find((m) => m.id == id)?.title)
										.join(', ')}</span
								>
							</div>
							<div class="move-stat">
								<span>Penetrated by</span><span
									>{selectedMove.penetrates
										.map((id) => moves.find((m) => m.id == id)?.title)
										.join(', ')}</span
								>
							</div>
						{:else if selectedMove.method == 'reload'}
							<div class="move-stat">
								<span>Unlocks</span><span>{selectedMove.for.map(forReloadsText).join(', ')}</span>
							</div>
						{/if}
					</div>
				{:else}
					<div class="move-detail-card move-detail-empty">
						<span style="font-size:3rem">🎯</span>
						<p class="muted">Select a move to see details</p>
					</div>
				{/if}

				<!-- Reload bars -->
				{#if currentPlayer}
					<div class="reload-bars-card">
						<h4 class="reload-bars-title">Your Arsenal</h4>
						{#each reloadsArray(currentPlayer) as reload}
							{@const maxForEdition = reloadMaxes[reload.edition] ?? 1}
							<div class="reload-bar-row">
								<div class="reload-bar-label">
									<span class="reload-name">{reload.edition}</span>
									<span class="reload-count">{reload.amount} / {maxForEdition}</span>
								</div>
								<div class="reload-bar-track">
									<div
										class="reload-bar-fill"
										style="width: {Math.min(100, (reload.amount / maxForEdition) * 100)}%"
									/>
								</div>
							</div>
						{/each}
						<div class="reload-bar-row" style="margin-top: 0.5rem;">
							<div class="reload-bar-label">
								<span class="reload-name" style="color: var(--accent2)">total (death smoke)</span>
								<span class="reload-count">{totalReloads(currentPlayer)} / 10</span>
							</div>
							<div class="reload-bar-track">
								<div
									class="reload-bar-fill reload-bar-accent"
									style="width: {Math.min(100, (totalReloads(currentPlayer) / 10) * 100)}%"
								/>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- ════════════════════════ PROCESSING ════════════════════════ -->
	{:else if status === 'processing'}
		<div class="center-screen">
			<div class="pulse-ring" />
			<h2 class="screen-title">Submitting…</h2>
			<p class="muted">Your move is being locked in.</p>
		</div>

		<!-- ════════════════════════ PLAYER DETAILS ════════════════════════ -->
	{:else if status === 'player-details'}
		<div class="details-header">
			<h2 class="screen-title">Player Details</h2>
			<button
				class="btn-secondary"
				on:click={() => {
					status = 'move';
				}}>← Back to Move</button
			>
		</div>

		{#if game.players.filter((p) => p.id == currentPlayerId).length}
			<h3 class="section-label">You</h3>
			<div class="player-cards">
				{#each game.players.filter((p) => p.id == currentPlayerId) as player}
					<div class="player-card" class:alive={!player.isDead} class:dead={player.isDead}>
						<div class="pc-header">
							<span class="pc-avatar">{player.bot ? '🤖' : '🧑'}</span>
							<div class="pc-name-block">
								<span class="pc-name self-text-blue">{player.name}</span>
								<span class="pc-id muted">#{player.id}</span>
							</div>
							<span class="self-badge">You</span>
						</div>
						<div class="pc-status">{player.isDead ? '💀 Eliminated' : '😊 Alive'}</div>
						{#if player.move}<div class="pc-last-move">🎲 {playerMoveText(player)}</div>{/if}
						<div class="pc-reloads">
							{#each reloadsArray(player) as reload}
								<div class="pc-reload-row">
									<span class="pc-reload-label">{reload.edition}</span>
									<div class="pc-reload-pips">
										{#each Array(Math.max(reload.amount, reloadMaxes[reload.edition])) as _, i}
											<span class="pip" class:filled={i < reload.amount} />
										{/each}
									</div>
									<span class="pc-reload-num">{reload.amount}</span>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if game.players.filter((p) => p.id != currentPlayerId && !p.isDead).length}
			<h3 class="section-label alive-text">Alive</h3>
			<div class="player-cards">
				{#each game.players.filter((p) => p.id != currentPlayerId && !p.isDead) as player}
					<div class="player-card alive">
						<div class="pc-header">
							<span class="pc-avatar">{player.bot ? '🤖' : '🧑'}</span>
							<div class="pc-name-block">
								<span class="pc-name">{player.name}</span>
								<span class="pc-id muted">#{player.id}</span>
							</div>
							{#if isHost && player.id != currentPlayerId}
								<button
									class="btn-danger btn-sm"
									on:click={() =>
										ws.send(JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } }))}
									>Kick</button
								>
							{/if}
						</div>
						<div class="pc-status">😊 Alive</div>
						{#if player.move}<div class="pc-last-move">🎲 {playerMoveText(player)}</div>{/if}
						<div class="pc-reloads">
							{#each reloadsArray(player) as reload}
								<div class="pc-reload-row">
									<span class="pc-reload-label">{reload.edition}</span>
									<div class="pc-reload-pips">
										{#each Array(Math.max(reload.amount, reloadMaxes[reload.edition])) as _, i}
											<span class="pip" class:filled={i < reload.amount} />
										{/each}
									</div>
									<span class="pc-reload-num">{reload.amount}</span>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if game.players.filter((p) => p.id != currentPlayerId && p.isDead).length}
			<h3 class="section-label dead-text">Eliminated</h3>
			<div class="player-cards">
				{#each game.players.filter((p) => p.id != currentPlayerId && p.isDead) as player}
					<div class="player-card dead">
						<div class="pc-header">
							<span class="pc-avatar">{player.bot ? '🤖' : '🧑'}</span>
							<div class="pc-name-block">
								<span class="pc-name">{player.name}</span>
								<span class="pc-id muted">#{player.id}</span>
							</div>
							{#if isHost && player.id != currentPlayerId}
								<button
									class="btn-danger btn-sm"
									on:click={() =>
										ws.send(JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } }))}
									>Kick</button
								>
							{/if}
						</div>
						<div class="pc-status">💀 Eliminated</div>
						{#if player.move}<div class="pc-last-move">🎲 {playerMoveText(player)}</div>{/if}
						<div class="pc-reloads">
							{#each reloadsArray(player) as reload}
								<div class="pc-reload-row">
									<span class="pc-reload-label">{reload.edition}</span>
									<div class="pc-reload-pips">
										{#each Array(Math.max(reload.amount, reloadMaxes[reload.edition])) as _, i}
											<span class="pip" class:filled={i < reload.amount} />
										{/each}
									</div>
									<span class="pc-reload-num">{reload.amount}</span>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- ════════════════════════ MOVED / WAITING ════════════════════════ -->
	{:else if status === 'moved'}
		<h2 class="screen-title">Waiting for Others…</h2>

		<div class="waiting-progress">
			<div class="waiting-counts">
				{game.playersMoved.length} of {game.players.filter((p) => !p.isDead && !p.bot).length} moved
			</div>
			<div class="waiting-bar-track">
				<div
					class="waiting-bar-fill"
					style="width:{(game.playersMoved.length /
						Math.max(1, game.players.filter((p) => !p.isDead && !p.bot).length)) *
						100}%"
				/>
			</div>
			<p class="muted">
				{game.players.filter((p) => p.isDead).length} eliminated · {game.players.filter(
					(p) => p.bot && !p.isDead
				).length} bot{game.players.filter((p) => p.bot && !p.isDead).length != 1 ? 's' : ''} (move after
				all humans)
			</p>
		</div>

		<div class="player-list">
			{#each game.players.filter((p) => !p.isDead && !p.bot) as player}
				<div class="lobby-player-row" class:is-self={player.id == currentPlayerId}>
					<span class="player-avatar">{game.playersMoved.includes(player.id) ? '✅' : '⏳'}</span>
					<span class="player-lobby-name" class:self-text-blue={player.id == currentPlayerId}
						>{player.name}</span
					>
					<span class="muted">#{player.id}</span>
					{#if isHost && player.id != currentPlayerId}
						<button
							class="btn-danger btn-sm"
							on:click={() =>
								ws.send(JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } }))}
							>Kick</button
						>
					{/if}
				</div>
			{/each}
		</div>

		{#if isHost}
			<button
				class="btn-secondary"
				style="margin-top: 1rem;"
				on:click={() => ws.send(JSON.stringify({ type: 'skip' }))}>⏭ Force Skip</button
			>
		{/if}

		<!-- ════════════════════════ PAIRINGS ANIMATION ════════════════════════ -->
	{:else if status === 'pairings'}
		<div class="pairings-screen">
			<button
				class="btn-secondary btn-sm"
				style="align-self:flex-end"
				on:click={() => stopPairings()}>Skip »</button
			>
			{#if pairing}
				<div class="pairing-display">
					<div class="pairing-fighter" class:is-self={pairing.player.id == currentPlayerId}>
						<div
							class="pairing-icon"
							class:mirror-h={moves.find((m) => m.id == pairing?.player.move?.action.id)
								?.iconFlipHorizontal}
							class:mirror-v={moves.find((m) => m.id == pairing?.player.move?.action.id)
								?.iconFlipVertical}
							class:rotate-90={moves.find((m) => m.id == pairing?.player.move?.action.id)
								?.rotateIcon == 90}
							class:rotate-negative-90={moves.find((m) => m.id == pairing?.player.move?.action.id)
								?.rotateIcon == -90}
						>
							{moves.find((m) => m.id == pairing?.player.move?.action.id)?.icon}
						</div>
						<div
							class="pairing-name"
							class:dead-text={pairing.player.isDead}
							class:alive-text={!pairing.player.isDead}
						>
							{pairing.player.name}
						</div>
						<div class="pairing-move-name">{pairing.player.move?.action.title ?? ''}</div>
					</div>

					{#if pairing.against}
						<div class="pairing-vs">VS</div>

						<div
							class="pairing-fighter"
							class:is-self={pairing.against != 'everyone' &&
								pairing.against?.id == currentPlayerId}
						>
							{#if pairing.against == 'everyone'}
								<div class="pairing-icon">🌍</div>
								<div class="pairing-name">Everyone</div>
							{:else}
								{#if pairing.againstEachOther}
									<div
										class="pairing-icon"
										class:mirror-h={!moves.find(
											(m) =>
												pairing?.against != 'everyone' && m.id == pairing?.against?.move?.action.id
										)?.iconFlipHorizontal}
										class:mirror-v={moves.find(
											(m) =>
												pairing?.against != 'everyone' && m.id == pairing?.against?.move?.action.id
										)?.iconFlipVertical}
										class:rotate-90={moves.find(
											(m) =>
												pairing?.against != 'everyone' && m.id == pairing?.against?.move?.action.id
										)?.rotateIcon == 90}
										class:rotate-negative-90={moves.find(
											(m) =>
												pairing?.against != 'everyone' && m.id == pairing?.against?.move?.action.id
										)?.rotateIcon == -90}
									>
										{moves.find(
											(m) =>
												pairing?.against != 'everyone' && m.id == pairing?.against?.move?.action.id
										)?.icon}
									</div>
								{:else}
									<div class="pairing-icon">🧍</div>
								{/if}
								<div
									class="pairing-name"
									class:dead-text={pairing.against?.isDead}
									class:alive-text={!pairing.against?.isDead}
								>
									{pairing.against?.name}
								</div>
								{#if pairing.againstEachOther}
									<div class="pairing-move-name">{pairing.against?.move?.action.title ?? ''}</div>
								{/if}
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- ════════════════════════ UPDATE ════════════════════════ -->
	{:else if status === 'update'}
		<h2 class="screen-title">Round Complete</h2>

		{#if game.players.find((p) => p.id == currentPlayerId)?.isDead}
			<div class="outcome-banner outcome-dead">💀 You were eliminated — spectating…</div>
		{:else}
			<div class="outcome-banner outcome-alive">
				😊 You survived!
				<button
					class="btn-primary btn-sm"
					on:click={() => {
						const remaining = game.players.filter((p) => !p.isDead && p.id != currentPlayerId);
						if (remaining.length > 0) against = remaining[0].id;
						moveTab = 'offense';
						selectedMove = undefined;
						status = 'move';
					}}>Next Round →</button
				>
			</div>
		{/if}

		{#if pairings(game).length > 0}
			<h4 class="section-label">This Round's Clashes &amp; Reloads</h4>
			<div class="pairing-list">
				{#each pairings(game) as { player, against: ag, againstEachOther }}
					<div
						class="pairing-list-row"
						class:self-involved={player.id == currentPlayerId ||
							(ag != 'everyone' && ag?.id == currentPlayerId)}
					>
						<span
							class:alive-text={!player.isDead}
							class:dead-text={player.isDead}
							class:self-text={player.id == currentPlayerId}
						>
							{player.name}
						</span>
						<span
							class="pairing-move-icon"
							class:mirror-h={moves.find((m) => m.id == player.move?.action.id)?.iconFlipHorizontal}
							class:mirror-v={moves.find((m) => m.id == player.move?.action.id)?.iconFlipVertical}
							class:rotate-90={moves.find((m) => m.id == player.move?.action.id)?.rotateIcon == 90}
							class:rotate-negative-90={moves.find((m) => m.id == player.move?.action.id)
								?.rotateIcon == -90}>{moves.find((m) => m.id == player.move?.action.id)?.icon}</span
						>
						{#if ag}
							<span class="pairing-arrow">→</span>
							{#if ag == 'everyone'}
								<span>🌍 Everyone</span>
							{:else}
								{#if againstEachOther}
									<span
										class="pairing-move-icon"
										class:mirror-h={!moves.find(
											(m) => ag != 'everyone' && m.id == ag?.move?.action.id
										)?.iconFlipHorizontal}
										class:mirror-v={moves.find(
											(m) => ag != 'everyone' && m.id == ag?.move?.action.id
										)?.iconFlipVertical}
										>{moves.find((m) => ag != 'everyone' && m.id == ag?.move?.action.id)
											?.icon}</span
									>
								{/if}
								<span
									class:alive-text={!ag?.isDead}
									class:dead-text={ag?.isDead}
									class:self-text={ag?.id == currentPlayerId}
								>
									{ag?.name}
								</span>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<button
			class="hide-show"
			on:click={() => {
				showCards = !showCards;
			}}>{showCards ? '▲ Hide' : '▼ Show'} Player Cards</button
		>

		{#if showCards}
			{#if game.players.filter((p) => p.move).length}
				<h4 class="section-label">Moved</h4>
				<div class="player-cards">
					{#each game.players.filter((p) => p.move) as player}
						<div class="player-card" class:alive={!player.isDead} class:dead={player.isDead}>
							<div class="pc-header">
								<span class="pc-avatar">{player.bot ? '🤖' : '🧑'}</span>
								<div class="pc-name-block">
									<span class="pc-name" class:self-text-blue={player.id == currentPlayerId}
										>{player.name}</span
									>
									<span class="pc-id muted">#{player.id}</span>
								</div>
								{#if player.id == currentPlayerId}<span class="self-badge">You</span>{/if}
								{#if isHost && player.id != currentPlayerId}
									<button
										class="btn-danger btn-sm"
										on:click={() =>
											ws.send(
												JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } })
											)}>Kick</button
									>
								{/if}
							</div>
							<div class="pc-status">{player.isDead ? '💀 Eliminated' : '😊 Alive'}</div>
							{#if player.move}<div class="pc-last-move">🎲 {playerMoveText(player)}</div>{/if}
							<div class="pc-reloads">
								{#each reloadsArray(player) as reload}
									<div class="pc-reload-row">
										<span class="pc-reload-label">{reload.edition}</span>
										<div class="pc-reload-pips">
											{#each Array(Math.max(reload.amount, reloadMaxes[reload.edition])) as _, i}
												<span class="pip" class:filled={i < reload.amount} />
											{/each}
										</div>
										<span class="pc-reload-num">{reload.amount}</span>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
			{#if game.players.filter((p) => !p.move).length}
				<h4 class="section-label muted">Did Not Move</h4>
				<div class="player-cards">
					{#each game.players.filter((p) => !p.move) as player}
						<div class="player-card" class:alive={!player.isDead} class:dead={player.isDead}>
							<div class="pc-header">
								<span class="pc-avatar">{player.bot ? '🤖' : '🧑'}</span>
								<div class="pc-name-block">
									<span class="pc-name" class:self-text-blue={player.id == currentPlayerId}
										>{player.name}</span
									>
									<span class="pc-id muted">#{player.id}</span>
								</div>
								{#if player.id == currentPlayerId}<span class="self-badge">You</span>{/if}
								{#if isHost && player.id != currentPlayerId}
									<button
										class="btn-danger btn-sm"
										on:click={() =>
											ws.send(
												JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } })
											)}>Kick</button
									>
								{/if}
							</div>
							<div class="pc-status">{player.isDead ? '💀 Eliminated' : '😊 Alive'}</div>
							<div class="pc-reloads">
								{#each reloadsArray(player) as reload}
									<div class="pc-reload-row">
										<span class="pc-reload-label">{reload.edition}</span>
										<div class="pc-reload-pips">
											{#each Array(Math.max(reload.amount, reloadMaxes[reload.edition])) as _, i}
												<span class="pip" class:filled={i < reload.amount} />
											{/each}
										</div>
										<span class="pc-reload-num">{reload.amount}</span>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}

		<!-- ════════════════════════ RESULTS ════════════════════════ -->
	{:else if status === 'results'}
		{#if !game}
			<div class="center-screen">
				<h2 class="screen-title">Disconnected</h2>
				<p class="muted">Lost connection to the server.</p>
				<button
					class="btn-primary"
					on:click={() => {
						if (window.location.pathname + window.location.search != '/')
							history.pushState(null, '', '/');
						window.location.reload();
					}}>Play Again</button
				>
			</div>
		{:else}
			<h2 class="screen-title">Game Over</h2>
			{#if game.players.find((p) => p.id == currentPlayerId)?.isDead}
				<div class="outcome-banner outcome-dead">💀 You lost!</div>
			{:else}
				<div class="outcome-banner outcome-alive">🏆 You won!</div>
			{/if}

			<div class="results-grid">
				<div class="panel">
					<h4 class="panel-title">🧑 Players</h4>
					{#each game.players
						.filter((p) => !p.bot)
						.sort((a, b) => (!a.isDead && b.isDead ? -1 : !b.isDead && a.isDead ? 1 : 0)) as player}
						<div
							class="result-row"
							class:result-win={!player.isDead}
							class:result-loss={player.isDead}
						>
							<span class:self-text-blue={player.id == currentPlayerId}>{player.name}</span>
							<span>{player.isDead ? '💀 lost' : '😊 won'}</span>
						</div>
					{/each}
				</div>
				{#if game.players.filter((p) => p.bot).length}
					<div class="panel">
						<h4 class="panel-title">🤖 Bots</h4>
						{#each game.players
							.filter((p) => p.bot)
							.sort( (a, b) => (!a.isDead && b.isDead ? -1 : !b.isDead && a.isDead ? 1 : 0) ) as player}
							<div
								class="result-row"
								class:result-win={!player.isDead}
								class:result-loss={player.isDead}
							>
								<span>{player.name}</span>
								<span>{player.isDead ? '💀' : '😊'}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<button
				class="btn-primary btn-lg"
				on:click={() => {
					if (window.location.pathname + window.location.search != '/')
						history.pushState(null, '', '/');
					window.location.reload();
				}}>Play Again</button
			>

			<details class="final-details">
				<summary>Final Round Details</summary>
				{#if pairings(game).length > 0}
					<h5 class="section-label">Clashes &amp; Reloads</h5>
					<div class="pairing-list">
						{#each pairings(game) as { player, against: ag, againstEachOther }}
							<div class="pairing-list-row">
								<span
									class:alive-text={!player.isDead}
									class:dead-text={player.isDead}
									class:self-text={player.id == currentPlayerId}>{player.name}</span
								>
								<span
									class="pairing-move-icon"
									class:mirror-h={moves.find((m) => m.id == player.move?.action.id)
										?.iconFlipHorizontal}
									class:mirror-v={moves.find((m) => m.id == player.move?.action.id)
										?.iconFlipVertical}
									>{moves.find((m) => m.id == player.move?.action.id)?.icon}</span
								>
								{#if ag}
									<span class="pairing-arrow">→</span>
									{#if ag == 'everyone'}
										<span>🌍 Everyone</span>
									{:else}
										{#if againstEachOther}
											<span
												class="pairing-move-icon"
												class:mirror-h={!moves.find(
													(m) => ag != 'everyone' && m.id == ag?.move?.action.id
												)?.iconFlipHorizontal}
												class:mirror-v={moves.find(
													(m) => ag != 'everyone' && m.id == ag?.move?.action.id
												)?.iconFlipVertical}
												>{moves.find((m) => ag != 'everyone' && m.id == ag?.move?.action.id)
													?.icon}</span
											>
										{/if}
										<span class:alive-text={!ag?.isDead} class:dead-text={ag?.isDead}
											>{ag?.name}</span
										>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				{/if}

				<button
					class="hide-show"
					on:click={() => {
						showCards = !showCards;
					}}>{showCards ? '▲ Hide' : '▼ Show'} Cards</button
				>
				{#if showCards}
					<div class="player-cards" style="margin-top:1rem">
						{#each game.players as player}
							<div class="player-card" class:alive={!player.isDead} class:dead={player.isDead}>
								<div class="pc-header">
									<span class="pc-avatar">{player.bot ? '🤖' : '🧑'}</span>
									<div class="pc-name-block">
										<span class="pc-name" class:self-text-blue={player.id == currentPlayerId}
											>{player.name}</span
										>
										<span class="pc-id muted">#{player.id}</span>
									</div>
									{#if player.id == currentPlayerId}<span class="self-badge">You</span>{/if}
								</div>
								<div class="pc-status">{player.isDead ? '💀 Eliminated' : '😊 Alive'}</div>
								{#if player.move}<div class="pc-last-move">🎲 {playerMoveText(player)}</div>{/if}
								<div class="pc-reloads">
									{#each reloadsArray(player) as reload}
										<div class="pc-reload-row">
											<span class="pc-reload-label">{reload.edition}</span>
											<div class="pc-reload-pips">
												{#each Array(Math.max(reload.amount, reloadMaxes[reload.edition])) as _, i}
													<span class="pip" class:filled={i < reload.amount} />
												{/each}
											</div>
											<span class="pc-reload-num">{reload.amount}</span>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</details>
		{/if}
	{/if}

	{#if bigError != ''}
		<div class="big-error">
			{#if status != 'results'}<strong>Error: </strong>{/if}{bigError}
		</div>
	{/if}
</main>

<style>
	/* ── Fonts & tokens ── */
	:root {
		--bg: #0d0f14;
		--surface: #161a23;
		--surface2: #1e2330;
		--border: rgba(255, 255, 255, 0.08);
		--border-bright: rgba(255, 255, 255, 0.18);
		--text: #e8eaf0;
		--muted: #6b7280;
		--accent: #00d4ff;
		--accent2: #ff6b35;
		--green: #22c55e;
		--red: #ef4444;
		--yellow: #eab308;
		--font-display: 'Orbitron', monospace;
		--font-body: 'Rajdhani', sans-serif;
		--radius: 10px;
		--transition: 0.18s ease;
	}

	:global(*, *::before, *::after) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}
	:global(body) {
		background: var(--bg);
		color: var(--text);
		font-family: var(--font-body);
		font-size: 1.05rem;
		min-height: 100vh;
		background-image: radial-gradient(
				ellipse 80% 60% at 50% -10%,
				rgba(0, 212, 255, 0.07) 0%,
				transparent 70%
			),
			radial-gradient(ellipse 50% 40% at 80% 80%, rgba(255, 107, 53, 0.05) 0%, transparent 60%);
	}

	/* ── Layout ── */
	.site-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--border);
		background: rgba(13, 15, 20, 0.85);
		backdrop-filter: blur(10px);
		position: sticky;
		top: 0;
		z-index: 100;
		flex-wrap: wrap;
	}

	.main-content {
		max-width: 1100px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
	}

	/* ── Title ── */
	.title {
		font-family: var(--font-display);
		font-size: 1.4rem;
		font-weight: 900;
		letter-spacing: 0.05em;
		color: var(--accent);
		text-decoration: none;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		text-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
	}

	.title-icon {
		font-size: 1.6rem;
	}

	.about-small {
		font-size: 0.7rem;
	}

	.about-small:hover {
		text-decoration: underline;
	}

	/* ── Screen title ── */
	.screen-title {
		font-family: var(--font-display);
		font-size: 1.6rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: var(--text);
		margin-bottom: 1.5rem;
	}

	/* ── Header player badge ── */
	.header-player-badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--surface2);
		border: 1px solid var(--border-bright);
		border-radius: 2rem;
		padding: 0.3rem 0.8rem;
		font-size: 0.85rem;
	}
	.badge-role {
		color: var(--accent);
		font-weight: 600;
	}
	.badge-name {
		font-weight: 600;
	}
	.badge-id {
		color: var(--muted);
	}
	.header-actions {
		margin-left: auto;
	}

	/* ── Panels ── */
	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.5rem;
	}
	.panel-title {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
		color: var(--accent);
		margin-bottom: 1.2rem;
		letter-spacing: 0.04em;
	}

	/* ── Entry grid ── */
	.entry-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
	}
	@media (max-width: 700px) {
		.entry-grid {
			grid-template-columns: 1fr;
		}
	}

	/* ── Form elements ── */
	.field-label {
		display: block;
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted);
		margin-bottom: 0.35rem;
		margin-top: 0.9rem;
	}
	.field-label:first-child {
		margin-top: 0;
	}

	.input-row {
		display: flex;
		align-items: center;
		position: relative;
	}

	input {
		width: 100%;
		background: var(--surface2);
		border: 1px solid var(--border-bright);
		border-radius: var(--radius);
		padding: 0.55rem 0.9rem;
		color: var(--text);
		font-family: var(--font-body);
		font-size: 1rem;
		outline: none;
		transition: border-color var(--transition), box-shadow var(--transition);
	}
	input:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.15);
	}
	input.ierror {
		border-color: var(--red);
	}
	input::placeholder {
		color: var(--muted);
	}

	.has-clear-button {
		padding-right: 2rem;
	}
	.hide-arrows::-webkit-outer-spin-button,
	.hide-arrows::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.hide-arrows[type='number'] {
		-moz-appearance: textfield;
		appearance: textfield;
	}

	/* ── Buttons ── */
	button {
		font-family: var(--font-body);
		font-size: 1rem;
		font-weight: 600;
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		transition: background var(--transition), transform var(--transition),
			box-shadow var(--transition);
		padding: 0.55rem 1.1rem;
	}
	button:active {
		transform: scale(0.97);
	}

	.btn-primary {
		background: var(--accent);
		color: #000;
		box-shadow: 0 0 16px rgba(0, 212, 255, 0.3);
	}
	.btn-primary:hover {
		background: #33dcff;
		box-shadow: 0 0 22px rgba(0, 212, 255, 0.5);
	}
	.btn-primary:disabled {
		background: var(--muted);
		color: #000;
		box-shadow: none;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: var(--surface2);
		color: var(--text);
		border: 1px solid var(--border-bright);
	}
	.btn-secondary:hover {
		background: var(--border-bright);
	}

	.btn-danger {
		background: var(--red);
		color: #fff;
	}
	.btn-danger:hover {
		background: #f87171;
	}

	.btn-sm {
		padding: 0.35rem 0.75rem;
		font-size: 0.85rem;
	}
	.btn-lg {
		padding: 0.75rem 2rem;
		font-size: 1.1rem;
		width: 100%;
		margin-top: 1rem;
	}
	.btn-icon {
		background: transparent;
		border: none;
		font-size: 1.2rem;
		padding: 0.25rem;
		color: var(--muted);
		transition: color var(--transition);
	}
	.btn-icon:hover {
		color: var(--text);
	}

	.btn-xs {
		padding: 0.2rem 0.5rem;
		font-size: 0.75rem;
		background: var(--surface2);
		border: 1px solid var(--border-bright);
		color: var(--text);
	}
	.btn-danger-xs {
		background: var(--red);
		color: #fff;
	}
	.btn-primary-xs {
		background: var(--accent);
		color: #000;
	}

	.clear-button {
		position: absolute;
		right: 0.6rem;
		background: transparent;
		color: var(--muted);
		border: none;
		padding: 0;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.clear-button:hover {
		color: var(--text);
	}

	.hide-show {
		background: transparent;
		border: none;
		color: var(--accent);
		font-style: italic;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		padding: 0.5rem 0;
		display: block;
		margin-top: 1rem;
	}

	.btn-row {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
		flex-wrap: wrap;
	}

	/* ── Toggles ── */
	.toggle-group {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-size: 0.95rem;
	}
	.toggle-label input[type='checkbox'] {
		accent-color: var(--accent);
		width: 1rem;
		height: 1rem;
	}
	.toggle-text small {
		color: var(--muted);
	}

	/* ── Lobby ── */
	.lobby-code-bar {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		background: var(--surface);
		border: 1px solid var(--border-bright);
		border-radius: var(--radius);
		padding: 0.75rem 1.2rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}
	.lobby-label {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	.lobby-code {
		font-family: var(--font-display);
		font-size: 1.8rem;
		font-weight: 900;
		color: var(--accent);
		letter-spacing: 0.1em;
	}

	.lobby-players {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem 1.2rem;
		margin-bottom: 1.5rem;
	}
	.lobby-players-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: 600;
		margin-bottom: 0.75rem;
		color: var(--muted);
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.player-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.lobby-player-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		background: var(--surface2);
		border: 1px solid var(--border);
		transition: border-color var(--transition);
	}
	.lobby-player-row.is-self {
		border-color: rgba(0, 212, 255, 0.3);
	}
	.player-avatar {
		font-size: 1.2rem;
	}
	.player-lobby-name {
		font-weight: 600;
		flex: 1;
	}
	.player-id {
		font-size: 0.8rem;
	}
	.self-badge {
		background: rgba(0, 212, 255, 0.15);
		color: var(--accent);
		border: 1px solid rgba(0, 212, 255, 0.3);
		border-radius: 99px;
		padding: 0.1rem 0.5rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	/* ── Move screen ── */
	.move-screen {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 1.5rem;
		align-items: start;
	}
	@media (max-width: 800px) {
		.move-screen {
			grid-template-columns: 1fr;
		}
	}

	.move-screen-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	/* Tab bar */
	.tab-bar {
		display: flex;
		gap: 0.25rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.25rem;
		margin-bottom: 1rem;
	}
	.tab-btn {
		flex: 1;
		background: transparent;
		color: var(--muted);
		border: none;
		border-radius: 7px;
		padding: 0.5rem 0.5rem;
		font-size: 0.85rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		transition: background var(--transition), color var(--transition);
	}
	.tab-btn:active {
		transform: none;
	}
	.tab-btn.active {
		background: var(--surface2);
		color: var(--text);
		border: 1px solid var(--border-bright);
	}
	.tab-count {
		background: var(--surface2);
		color: var(--muted);
		border-radius: 99px;
		padding: 0 0.35rem;
		font-size: 0.7rem;
		min-width: 1.3em;
		text-align: center;
	}
	.tab-btn.active .tab-count {
		background: rgba(0, 212, 255, 0.15);
		color: var(--accent);
	}

	/* Move tiles grid */
	.move-cards-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 0.6rem;
		margin-bottom: 1rem;
	}
	.move-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.75rem 0.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		transition: border-color var(--transition), background var(--transition),
			transform var(--transition), box-shadow var(--transition);
		text-align: center;
	}
	.move-tile:hover {
		border-color: var(--border-bright);
		background: var(--surface2);
	}
	.move-tile.selected {
		border-color: var(--accent);
		background: rgba(0, 212, 255, 0.08);
		box-shadow: 0 0 12px rgba(0, 212, 255, 0.2);
	}
	.move-tile-icon {
		font-size: 1.8rem;
		line-height: 1;
		display: inline-block;
	}
	.move-tile-name {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text);
	}
	.move-tile-cost {
		font-size: 0.7rem;
		color: var(--accent2);
		font-weight: 600;
	}

	/* Target selector */
	.target-selector {
		margin-bottom: 1rem;
	}
	.target-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.4rem;
	}
	.target-btn {
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		border-radius: 99px;
		padding: 0.35rem 0.8rem;
		font-size: 0.88rem;
		transition: border-color var(--transition), background var(--transition);
	}
	.target-btn:hover {
		border-color: var(--border-bright);
	}
	.target-btn.selected {
		border-color: var(--accent2);
		background: rgba(255, 107, 53, 0.12);
		color: var(--accent2);
	}

	/* Reload resource picker */
	.reload-resource-picker {
		margin-bottom: 1rem;
	}
	.resource-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.3rem;
	}
	.resource-row input {
		width: 80px;
		flex: none;
	}

	/* Move detail card */
	.move-detail-card {
		background: var(--surface);
		border: 1px solid var(--border-bright);
		border-radius: var(--radius);
		padding: 1.2rem;
		margin-bottom: 1rem;
		text-align: center;
	}
	.move-detail-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 2rem;
	}
	.move-detail-icon {
		font-size: 3rem;
		margin-bottom: 0.5rem;
		display: inline-block;
	}
	.move-detail-title {
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--accent);
		margin-bottom: 0.5rem;
	}
	.move-detail-tags {
		display: flex;
		justify-content: center;
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}
	.tag {
		border-radius: 99px;
		padding: 0.15rem 0.6rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.tag-method {
		background: rgba(0, 212, 255, 0.12);
		color: var(--accent);
		border: 1px solid rgba(0, 212, 255, 0.25);
	}
	.tag-dir {
		background: rgba(255, 107, 53, 0.12);
		color: var(--accent2);
		border: 1px solid rgba(255, 107, 53, 0.25);
	}
	.move-stat {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		border-top: 1px solid var(--border);
		padding: 0.35rem 0;
		font-size: 0.88rem;
		text-align: left;
		gap: 0.5rem;
	}
	.move-stat > span:first-child {
		color: var(--muted);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}
	.move-stat > span:last-child {
		text-align: right;
	}

	/* Reload bars */
	.reload-bars-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem 1.2rem;
	}
	.reload-bars-title {
		font-family: var(--font-display);
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 0.75rem;
	}
	.reload-bar-row {
		margin-bottom: 0.6rem;
	}
	.reload-bar-label {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.2rem;
		font-size: 0.82rem;
	}
	.reload-name {
		font-weight: 600;
		color: var(--text);
		text-transform: capitalize;
	}
	.reload-count {
		color: var(--muted);
	}
	.reload-bar-track {
		height: 6px;
		background: var(--surface2);
		border-radius: 99px;
		overflow: hidden;
		border: 1px solid var(--border);
	}
	.reload-bar-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 99px;
		transition: width 0.4s ease;
		box-shadow: 0 0 6px rgba(0, 212, 255, 0.5);
	}
	.reload-bar-accent {
		background: var(--accent2);
		box-shadow: 0 0 6px rgba(255, 107, 53, 0.5);
	}

	/* ── Player cards grid ── */
	.player-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.player-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		transition: border-color var(--transition);
	}
	.player-card.alive {
		border-color: rgba(34, 197, 94, 0.4);
		background: rgba(34, 197, 94, 0.05);
	}
	.player-card.dead {
		border-color: rgba(239, 68, 68, 0.4);
		background: rgba(239, 68, 68, 0.05);
	}

	.pc-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.pc-avatar {
		font-size: 1.4rem;
	}
	.pc-name-block {
		flex: 1;
		min-width: 0;
	}
	.pc-name {
		font-weight: 700;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pc-id {
		font-size: 0.75rem;
	}
	.pc-status {
		font-size: 0.85rem;
		margin-bottom: 0.4rem;
	}
	.pc-last-move {
		font-size: 0.8rem;
		color: var(--muted);
		margin-bottom: 0.6rem;
	}

	.pc-reloads {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.pc-reload-row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.pc-reload-label {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: capitalize;
		color: var(--muted);
		width: 50px;
	}
	.pc-reload-pips {
		display: flex;
		gap: 2px;
		flex: 1;
		flex-wrap: wrap;
	}
	.pip {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		border: 1px solid var(--border-bright);
		background: var(--surface2);
		flex-shrink: 0;
	}
	.pip.filled {
		background: var(--accent);
		border-color: var(--accent);
		box-shadow: 0 0 4px rgba(0, 212, 255, 0.4);
	}
	.pc-reload-num {
		font-size: 0.75rem;
		color: var(--muted);
		width: 16px;
		text-align: right;
	}

	/* ── Waiting ── */
	.waiting-progress {
		margin-bottom: 1.5rem;
	}
	.waiting-counts {
		font-family: var(--font-display);
		font-size: 1.3rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		color: var(--accent);
	}
	.waiting-bar-track {
		height: 8px;
		background: var(--surface2);
		border-radius: 99px;
		margin-bottom: 0.5rem;
	}
	.waiting-bar-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 99px;
		transition: width 0.4s ease;
		box-shadow: 0 0 8px rgba(0, 212, 255, 0.4);
	}

	/* ── Pairings ── */
	.pairings-screen {
		min-height: 60vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2rem;
	}
	.pairing-display {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		flex-wrap: wrap;
	}
	.pairing-fighter {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.5rem 2rem;
		min-width: 140px;
		text-align: center;
		animation: fadeSlide 0.3s ease;
	}
	.pairing-fighter.is-self {
		border-color: rgba(0, 212, 255, 0.4);
		box-shadow: 0 0 20px rgba(0, 212, 255, 0.15);
	}
	.pairing-icon {
		font-size: 4rem;
		line-height: 1;
		display: inline-block;
	}
	.pairing-name {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
	}
	.pairing-move-name {
		font-size: 0.85rem;
		color: var(--muted);
	}
	.pairing-vs {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 900;
		color: var(--accent2);
		text-shadow: 0 0 20px rgba(255, 107, 53, 0.5);
	}

	@keyframes fadeSlide {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ── Pairing list ── */
	.pairing-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 1rem;
	}
	.pairing-list-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 7px;
		font-size: 0.9rem;
	}
	.pairing-list-row.self-involved {
		border-color: rgba(0, 212, 255, 0.3);
	}
	.pairing-move-icon {
		font-size: 1.1rem;
		display: inline-block;
	}
	.pairing-arrow {
		color: var(--muted);
	}

	/* ── Outcome banners ── */
	.outcome-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-radius: var(--radius);
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
	}
	.outcome-alive {
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.4);
		color: var(--green);
	}
	.outcome-dead {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.4);
		color: var(--red);
	}

	/* ── Results ── */
	.results-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.result-row {
		display: flex;
		justify-content: space-between;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}
	.result-win {
		color: var(--green);
	}
	.result-loss {
		color: var(--red);
	}

	.final-details {
		margin-top: 2rem;
	}
	.final-details summary {
		cursor: pointer;
		font-weight: 600;
		color: var(--muted);
	}

	/* ── Center screen ── */
	.center-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		gap: 1rem;
		text-align: center;
	}

	/* ── Pulse ring ── */
	.pulse-ring {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		border: 3px solid var(--accent);
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			transform: scale(0.9);
			opacity: 0.6;
			box-shadow: 0 0 0 0 rgba(0, 212, 255, 0.4);
		}
		50% {
			transform: scale(1.1);
			opacity: 1;
			box-shadow: 0 0 0 14px rgba(0, 212, 255, 0);
		}
	}

	/* ── Utility ── */
	.muted {
		color: var(--muted);
		font-size: 0.88rem;
	}
	.section-label {
		font-family: var(--font-display);
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
		margin: 1.5rem 0 0.75rem;
	}
	.details-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.public-games {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.public-games-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.3rem;
	}
	.public-game-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: var(--surface2);
		border: 1px solid var(--border);
		border-radius: 7px;
		padding: 0.4rem 0.75rem;
	}
	.public-game-info {
		font-size: 0.85rem;
	}

	.big-error {
		margin-top: 1.5rem;
		padding: 0.75rem 1.2rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: var(--radius);
		color: var(--red);
		font-size: 0.95rem;
	}
	.error-msg {
		color: var(--red);
		font-size: 0.9rem;
		margin-bottom: 0.75rem;
	}

	.alive-text {
		color: var(--green);
	}
	.dead-text {
		color: var(--red);
	}
	.self-text {
		font-weight: 700;
		font-style: italic;
	}
	.self-text-blue {
		font-weight: 700;
		font-style: italic;
		color: var(--accent);
	}

	/* ── Icon transforms — must use display:inline-block to work ── */
	.mirror-h {
		transform: scaleX(-1);
	}
	.mirror-v {
		transform: scaleY(-1);
	}
	.rotate-90 {
		transform: rotate(-90deg);
	}
	.rotate-negative-90 {
		transform: rotate(90deg);
	}
	.mirror-h.mirror-v {
		transform: scaleX(-1) scaleY(-1);
	}
	.mirror-h.rotate-90 {
		transform: scaleX(-1) rotate(-90deg);
	}
	.mirror-h.rotate-negative-90 {
		transform: scaleX(-1) rotate(90deg);
	}
	.mirror-v.rotate-90 {
		transform: scaleY(-1) rotate(-90deg);
	}
	.mirror-v.rotate-negative-90 {
		transform: scaleY(-1) rotate(90deg);
	}
	.mirror-h.mirror-v.rotate-90 {
		transform: scaleX(-1) scaleY(-1) rotate(-90deg);
	}
	.mirror-h.mirror-v.rotate-negative-90 {
		transform: scaleX(-1) scaleY(-1) rotate(90deg);
	}
</style>
