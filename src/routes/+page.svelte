<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { JSONRetrocycle } from '$lib/cycle';
	import type { Game, Player } from '$lib/Game';
	import { moves } from '$lib/Game';

	let ws: WebSocket;

	let game: Game;

	let isHost = false;

	let selectedMove: (typeof moves)[number];

	let currentPlayerId: number;

	let reloadSelection: (typeof game.players)[number]['reloads'] = {
		knife: 0,
		ball: 0,
		bazooka: 0,
		spiral: 0
	};

	let against: number;

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
				if (bigError == 'Game Not Found (refreshing public games...)') {
					bigError = 'Game Not Found';
				}
				if (bigError == 'Game Full (refreshing public games...)') {
					bigError = 'Game Full';
				}
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
					against = game.players.filter((p) => !p.isDead && p.id != currentPlayerId)[0].id;
					status = 'move';
					break;
				case 'player-loaded':
					if (payload.loadedPlayerId == currentPlayerId) {
						status = 'moved';
					}
					break;
				case 'game-updated':
					status = 'pairings';
					showPairings();
					break;
				case 'game-ended':
					ws.close();
					stopPairings();
					status = 'results';
					bigError = 'End Reason: ' + payload.reason;
					break;
				case 'player-removed':
					if (payload.removedPlayerId == currentPlayerId) {
						ws.close();
						status = 'results';
						bigError = 'Removal Reason: ' + payload.reason;
					}
					break;
				case 'player-removed-update':
					against = game.players.filter((p) => !p.isDead && p.id != currentPlayerId)[0].id;
					break;
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
		if (gidInt && !isNaN(gidInt)) {
			gameId = gidInt.toString();
		}
	}
	let cap = '';

	let lastPlayerKeepsPlaying = false;
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

	function playerMoveText(player: Player) {
		if (player.move) {
			return (
				'Used ' +
				player.move.action.title +
				' (' +
				player.move.action.method +
				')' +
				direction(player)
			);
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

	function playerReloadTextArray(player: Player) {
		const reloads = Object.keys(player.reloads).map((key) => {
			return key + ': ' + player.reloads[key as keyof typeof player.reloads];
		});

		return reloads;
	}

	function reloadsArray(player: Player | undefined) {
		if (!player) return [];
		const reloads = Object.keys(player.reloads).map((key) => {
			return {
				edition: key as keyof typeof player.reloads,
				amount: player.reloads[key as keyof typeof player.reloads]
			};
		});

		return reloads;
	}

	function reloadSelectionToArray() {
		if (!reloadSelection) return undefined;
		const reloads = Object.keys(reloadSelection).map((key) => {
			return {
				edition: key as keyof typeof reloadSelection,
				amount: reloadSelection[key as keyof typeof reloadSelection]
			};
		});

		return reloads;
	}

	function hasEnoughReloads(player: Player | undefined, reload: any) {
		if (!player) return false;
		if (!reload) return true;
		if (player.reloads[reload.edition as keyof typeof player.reloads] < reload.amount) {
			return false;
		}
		return true;
	}

	function hasEnoughAnyReloads(player: Player | undefined, amount: number) {
		if (!player) return false;
		let sum = 0;
		for (const reload of reloadsArray(player)) {
			sum += reload.amount;
		}
		if (sum < amount) {
			return false;
		}
		return true;
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
			if (a.bot && !b.bot) {
				return 1;
			} else if (!a.bot && b.bot) {
				return -1;
			}

			if (a.move?.action.method == 'reload' && b.move?.action.method == 'offense') {
				return 1;
			} else if (a.move?.action.method == 'offense' && b.move?.action.method == 'reload') {
				return -1;
			}

			return 0;
		});

		const pairings: {
			player: Player;
			against: Player | undefined | 'everyone';
			againstEachOther: boolean;
		}[] = [];
		const used: number[] = [];

		for (const player of players) {
			if (used.includes(player.id)) continue;
			used.push(player.id);
			if (player.move?.action.dir == 'one') {
				const against = player.move?.direction;
				if (against) {
					if (against.move?.action.dir == 'one' && against.move?.direction?.id == player.id) {
						used.push(against.id);
						pairings.push({ player, against, againstEachOther: true });
					} else if (against.move?.action.dir == 'all') {
						pairings.push({
							player,
							against,
							againstEachOther: true
						});
					} else {
						pairings.push({ player, against, againstEachOther: false });
					}
				}
			} else if (player.move?.action.dir == 'self') {
				pairings.push({ player, against: undefined, againstEachOther: false });
			} else if (player.move?.action.dir == 'all') {
				pairings.push({
					player,
					against: 'everyone',
					againstEachOther: false
				});
			}
		}

		pairings.sort((a, b) => {
			if (
				(a.player.id == currentPlayerId ||
					a.against == 'everyone' ||
					a.against?.id == currentPlayerId) &&
				b.player.id != currentPlayerId &&
				b.against != 'everyone' &&
				b.against?.id != currentPlayerId
			) {
				return -1;
			} else if (
				(b.player.id == currentPlayerId ||
					b.against == 'everyone' ||
					b.against?.id == currentPlayerId) &&
				a.player.id != currentPlayerId &&
				a.against != 'everyone' &&
				a.against?.id != currentPlayerId
			) {
				return 1;
			}

			return 0;
		});

		return pairings;
	}

	let currentPairingIndex: number = 0;
	let pairingsInterval: number;
	let pairing: ReturnType<typeof pairings>[number] | undefined;

	function showPairings() {
		currentPairingIndex = 0;

		if (currentPairingIndex >= pairings(game).length) {
			status = 'update';
			stopPairings();
			return;
		}

		pairing = pairings(game)[currentPairingIndex];

		currentPairingIndex++;

		pairingsInterval = setInterval(() => {
			if (currentPairingIndex >= pairings(game).length) {
				status = 'update';
				stopPairings();
				return;
			}

			pairing = pairings(game)[currentPairingIndex];

			currentPairingIndex++;
		}, 1000);
	}

	function stopPairings() {
		clearInterval(pairingsInterval);
		status = 'update';
	}
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
		content="The traditional game of shotgun/war codified and taken to the next level with more possible moves and avenues. It's online, free, ad-free, and multiplayer, so try it out!"
	/>
</svelte:head>

<h1>
	<a
		class="title"
		href="/about"
		target={status == 'connecting' || status == 'connected' || status == 'results' ? '' : '_blank'}
		title="Read About Ultra Ball">🌀 Ultra Ball</a
	>
	{#if currentPlayerId}
		<small
			>({isHost ? 'Host' : 'Player'} &mdash;
			<i>{currentPlayerId}: {game.players.find((p) => p.id == currentPlayerId)?.name}</i>)</small
		>
	{/if}
	{#if isHost && game && !game.gameEnded && status != 'connecting' && status != 'connected' && status != 'results'}
		<button class="remove-button" on:click={() => ws.send(JSON.stringify({ type: 'end-game' }))}
			>End Game</button
		>
	{:else if !isHost && game && !game.gameEnded && status != 'connecting' && status != 'connected' && status != 'results'}
		<button
			class="remove-button"
			on:click={() => {
				ws.send(JSON.stringify({ type: 'leave-game', payload: { playerId: currentPlayerId } }));
				ws.close();
				status = 'results';
				bigError = 'Removal Reason: left';
			}}>Leave Game</button
		>
	{/if}
</h1>
{#if status === 'connecting'}
	<h2>Connecting...</h2>
{:else if status === 'connected'}
	<h2>Create/Join a Game</h2>
	<div>
		<div>
			<label for="name">Screen Name: </label><input
				class="has-clear-button"
				id="name"
				type="text"
				bind:value={name}
			/><button
				class="clear-button"
				on:click={() => {
					name = '';
				}}
			>
				✕
			</button>
		</div>
		<br />
		<br />
		<div>
			<div>
				<label for="gameCode">Game Code (#): </label><input
					class="hide-arrows has-clear-button"
					id="gameCode"
					min="1"
					type="number"
					inputmode="numeric"
					class:ierror={gameId &&
						(parseInt(gameId) < 1 || bigError == 'Game Not Found' || bigError == 'Game Full')}
					bind:value={gameId}
					on:keydown={(e) => {
						if ((bigError = 'Game Not Found' || bigError == 'Game Full')) {
							bigError = '';
						}
						if (e.key == 'Enter') {
							if (name && name != '' && gameId && parseInt(gameId) > 0)
								ws.send(
									JSON.stringify({ type: 'join-game', payload: { name, gameId: parseInt(gameId) } })
								);
						}
					}}
				/>
				<button
					class="clear-button"
					on:click={() => {
						if (window.location.pathname + window.location.search != '/') {
							history.pushState(null, '', '/');
						}
						gameId = '';
						if ((bigError = 'Game Not Found' || bigError == 'Game Full')) {
							bigError = '';
						}
					}}
				>
					✕
				</button>
				<button
					disabled={!name || name == '' || !gameId || parseInt(gameId) < 1}
					on:click={() => {
						if (name && name != '' && gameId && parseInt(gameId) > 0)
							ws.send(
								JSON.stringify({ type: 'join-game', payload: { name, gameId: parseInt(gameId) } })
							);
					}}>Join</button
				>
				{#if searchedGames.length > 0}
					<h3>
						Public Games
						<button
							on:click={() => {
								ws.send(JSON.stringify({ type: 'search-games' }));
							}}>Refresh</button
						>
						<button
							class="remove-button"
							on:click={() => {
								searchedGames = [];
							}}>Clear</button
						>
					</h3>
					<ul>
						{#each searchedGames as game}
							<li>
								{game.id} by {game.host}
								<br />
								{game.players} joined of {game.cap} maximum players
								<br />
								{game.bots}
								{game.bots != 1 ? 'bots' : 'bot'}
								<br />
								Mode: {game.lastPlayerKeepsPlaying
									? 'Last player keeps playing against bots'
									: 'Last player automatically wins'}
								<br />
								<button
									on:click={() => {
										gameId = game.id.toString();

										if (name && name != '' && gameId && parseInt(gameId) > 0)
											ws.send(
												JSON.stringify({
													type: 'join-game',
													payload: { name, gameId: parseInt(gameId) }
												})
											);
									}}>Join</button
								>
							</li>
						{/each}
					</ul>
				{:else}
					<br />
					<button
						on:click={() => {
							ws.send(JSON.stringify({ type: 'search-games' }));
						}}>Search For Games</button
					>
				{/if}
			</div>
			<br />
			<div>
				<label for="cap">Player Cap (🧑): </label><input
					id="cap"
					type="number"
					inputmode="numeric"
					min={lastPlayerKeepsPlaying ? 1 : 2}
					class:ierror={cap && parseInt(cap) < (lastPlayerKeepsPlaying ? 1 : 2)}
					bind:value={cap}
					on:change={() => {
						if (parseInt(cap) <= 1) {
							isPublic = false;
							lastPlayerKeepsPlaying = true;
						}
					}}
					on:keydown={(e) => {
						if (e.key == 'Enter') {
							if (
								name &&
								name != '' &&
								cap &&
								parseInt(cap) > 0 &&
								(lastPlayerKeepsPlaying || parseInt(cap) > 1)
							) {
								ws.send(
									JSON.stringify({
										type: 'create-game',
										payload: { name, cap: parseInt(cap), lastPlayerKeepsPlaying, isPublic }
									})
								);
							}
						}
					}}
				/>
				<button
					disabled={!name ||
						name == '' ||
						!cap ||
						parseInt(cap) < 1 ||
						(!lastPlayerKeepsPlaying && parseInt(cap) < 2)}
					on:click={() => {
						if (
							name &&
							name != '' &&
							cap &&
							parseInt(cap) > 0 &&
							(lastPlayerKeepsPlaying || parseInt(cap) > 1)
						) {
							ws.send(
								JSON.stringify({
									type: 'create-game',
									payload: { name, cap: parseInt(cap), lastPlayerKeepsPlaying, isPublic }
								})
							);
						}
					}}>Create</button
				>
				<br />
				<input type="checkbox" id="lastPlayerKeepsPlaying" bind:checked={lastPlayerKeepsPlaying} />
				<label for="lastPlayerKeepsPlaying"
					>Last Player Keeps Battling Bots (if applicable)? {lastPlayerKeepsPlaying ? 'Yes' : 'No'}
					<br />
					<small>(Needed for Solo)</small></label
				>
				<br />
				<input
					type="checkbox"
					id="isPublic"
					disabled={parseInt(cap) <= 1}
					bind:checked={isPublic}
				/>
				<label for="isPublic">Public Game? {isPublic ? 'Yes' : 'No'}</label>
			</div>
		</div>
	</div>
{:else if status === 'lobby'}
	<h2>Lobby</h2>
	<h3>
		Game Code: {game.id}
		{#if game.players.filter((p) => !p.bot).length > 1 || game.cap > 1}
			<button
				on:click={() => {
					navigator.clipboard.writeText(game.id.toString());
				}}>📋 <small>code</small></button
			>
			<button
				on:click={() => {
					navigator.clipboard.writeText(window.location.href);
				}}>🔗 <small>link</small></button
			>
		{:else}
			<br />
			You're playing solo! Add as many bots as you want and then start.
		{/if}
	</h3>
	<p>
		Players ({game.cap == 1
			? 'solo'
			: game.players.filter((p) => !p.bot).length.toString() + ' of ' + game.cap.toString()}):
	</p>
	{#if isHost}
		<button
			on:click={() => {
				ws.send(JSON.stringify({ type: 'add-bot' }));
			}}>Add Bot</button
		>
	{/if}
	<ul>
		{#each game.players as player}
			<li>
				<span class:self-text-blue={player.id == currentPlayerId}
					>{player.id}: {player.name} ({player.bot ? '🤖' : '🧑'})</span
				>
				{#if isHost && player.id != currentPlayerId}
					<button
						class="remove-button"
						on:click={() =>
							ws.send(JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } }))}
						>Remove</button
					>
				{/if}
			</li>
		{/each}
	</ul>
	{#if isHost}
		<br />
		<button
			disabled={game.players.filter((p) => !p.bot).length <= 0 ||
				(!game.lastPlayerKeepsPlaying && game.players.filter((p) => !p.bot).length <= 1) ||
				(game.players.filter((p) => p.bot).length < 1 &&
					game.players.filter((p) => !p.bot).length < 2)}
			on:click={() => ws.send(JSON.stringify({ type: 'start-game' }))}>Start</button
		>
	{/if}
{:else if status === 'move'}
	<h2>
		Make Your Move
		<button
			on:click={() => {
				status = 'player-details';
			}}>See Player Details</button
		>
	</h2>
	<label for="select-move">Move:</label>
	<select id="select-move" bind:value={selectedMove}>
		{#each moves as move}
			{#if !((move.method == 'offense' && move.needs?.edition != 'any' && !hasEnoughReloads( game.players.find((p) => p.id == currentPlayerId), move.needs )) || (move.method == 'offense' && move.needs?.edition == 'any' && !hasEnoughAnyReloads( game.players.find((p) => p.id == currentPlayerId), move.needs.amount )))}
				<option value={move}
					>{move.method == 'reload' ? '🔄' : ''}{move.icon} {move.title} ({move.method})</option
				>
			{/if}
		{/each}
	</select>
	<br />
	<br />
	{#if selectedMove}
		<div class="move-card">
			<p><b>Move Statistics</b></p>
			<p><u>Name:</u> {selectedMove.title}</p>
			<p>
				<u>Method:</u>
				{selectedMove.method.charAt(0).toUpperCase() + selectedMove.method.slice(1)}
			</p>
			<p>
				<u>Direction:</u>
				{selectedMove.dir.charAt(0).toUpperCase() + selectedMove.dir.slice(1)}
			</p>
			{#if selectedMove.method == 'offense' && selectedMove.needs?.edition == 'any'}
				<p><u>Needs:</u> {selectedMove.needs.amount} reloads (any)</p>
			{:else if selectedMove.method == 'offense' && selectedMove.needs?.edition}
				<p>
					<u>Needs</u>: {selectedMove.needs.amount}
					{selectedMove.needs.edition}
					{selectedMove.needs.amount != 1 ? 'reloads' : 'reload'}
				</p>
			{/if}
			{#if selectedMove.method == 'offense'}
				{#if selectedMove.beats.length > 0}
					<p>
						<u>Beats:</u>
						{selectedMove.beats
							.map((moveId) => moves.find((move) => move.id == moveId)?.title)
							.join(', ')}
					</p>
				{:else}
					<p>
						<u>Beats:</u> Nothing (but still may be useful for penetrating certain defenses)
					</p>
				{/if}
			{:else if selectedMove.method == 'defense-offense'}
				<p>
					<u>Reflects:</u>
					{selectedMove.reflects
						.map((moveId) => moves.find((move) => move.id == moveId)?.title)
						.join(', ')}
				</p>
				<p>
					<u>Penetrated By:</u>
					{selectedMove.penetrates
						.map((moveId) => moves.find((move) => move.id == moveId)?.title)
						.join(', ')}
				</p>
			{:else if selectedMove.method == 'defense'}
				<p>
					<u>Defends Against:</u>
					{selectedMove.defends
						.map((moveId) => moves.find((move) => move.id == moveId)?.title)
						.join(', ')}
				</p>
				<p>
					<u>Penetrated By:</u>
					{selectedMove.penetrates
						.map((moveId) => moves.find((move) => move.id == moveId)?.title)
						.join(', ')}
				</p>
			{:else if selectedMove.method == 'reload'}
				<p>
					<u>Needed For:</u>
					{selectedMove.for.map(forReloadsText).join(', ')}
				</p>
			{/if}
		</div>
	{/if}
	{#if selectedMove && selectedMove.dir === 'one'}
		<br />
		<label for="select-against">Against:</label>
		<select id="select-against" bind:value={against}>
			{#each game.players.filter((p) => !p.isDead) as player}
				{#if player.id !== currentPlayerId}
					<option value={player.id}>{player.id}: {player.name} ({player.bot ? '🤖' : '🧑'})</option>
				{/if}
			{/each}
		</select>
	{/if}
	{#if selectedMove && selectedMove.method == 'offense' && selectedMove.needs?.edition == 'any'}
		<br />
		Using Reloads:
		<br />
		{#each reloadsArray(game.players.find((p) => p.id == currentPlayerId)) as reload}
			{#if reload.amount > 0}
				<label for="reload-{reload.edition}"
					>{reload.edition.charAt(0).toUpperCase() + reload.edition.slice(1)} (have {reload.amount}):</label
				>
				<input
					type="number"
					inputmode="numeric"
					id="reload-{reload.edition}"
					min="0"
					max={reload.amount}
					bind:value={reloadSelection[reload.edition]}
				/>
				<br />
			{/if}
		{/each}
	{/if}

	<p class="error">{errorMessage != '' ? 'Error: ' + errorMessage : ''}</p>

	<button
		on:click={() => {
			const player = game.players.find((p) => p.id == currentPlayerId);

			if (!player) return;

			const playerReloads = JSON.parse(JSON.stringify(player.reloads));

			const usingReloads = reloadSelectionToArray();

			if (
				usingReloads &&
				selectedMove.method == 'offense' &&
				selectedMove.needs?.edition == 'any'
			) {
				let allSum = 0;
				for (const use of usingReloads) {
					allSum += use.amount;
				}
				if (allSum != selectedMove.needs.amount) {
					errorMessage =
						"Your selected move, '" +
						selectedMove.title +
						"', requires " +
						selectedMove.needs.amount +
						' reloads, but you selected ' +
						allSum +
						'.';
					return;
				}

				let counter = 0;
				for (const use of usingReloads) {
					if (playerReloads[use.edition] >= use.amount) {
						playerReloads[use.edition] -= use.amount;
						counter += use.amount;
					} else {
						break;
					}
				}

				if (counter < selectedMove.needs.amount) {
					errorMessage = "You don't have all of the reloads you selected.";
					return;
				}
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

			selectedMove = moves[0];
			errorMessage = '';
			reloadSelection = { knife: 0, ball: 0, bazooka: 0, spiral: 0 };
		}}>Submit</button
	>
{:else if status === 'processing'}
	<h2>Processing your move...</h2>
	<p>Your move is loading into the system. Please wait.</p>
{:else if status === 'player-details'}
	<h2>
		Player Details
		<button
			on:click={() => {
				status = 'move';
			}}>Back</button
		>
	</h2>
	<h3>You</h3>
	<div class="player-cards">
		{#each game.players.filter((p) => p.id == currentPlayerId) as player}
			<div class="player-card" class:alive={!player.isDead} class:dead={player.isDead}>
				<p>
					<b
						><span class:self-text-blue={player.id == currentPlayerId}
							>{player.id}: {player.name} ({player.bot ? '🤖' : '🧑'})</span
						></b
					>
				</p>
				<p><u>Status:</u> {player.isDead ? 'Dead 💀' : 'Alive 😊'}</p>
				<p><u>Last Move:</u> {playerMoveText(player)}</p>
				<p><u>Reloads:</u></p>
				<ul>
					{#each playerReloadTextArray(player) as reload}
						<li>{reload}</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
	{#if game.players.filter((p) => p.id != currentPlayerId && !p.isDead).length}
		<h3>Others (Alive)</h3>
		<div class="player-cards">
			{#each game.players.filter((p) => p.id != currentPlayerId && !p.isDead) as player}
				<div class="player-card alive">
					<p>
						<b
							><span class:self-text-blue={player.id == currentPlayerId}
								>{player.id}: {player.name} ({player.bot ? '🤖' : '🧑'})</span
							></b
						>
						{#if isHost}
							<button
								class="remove-button"
								on:click={() =>
									ws.send(JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } }))}
								>Remove</button
							>
						{/if}
					</p>
					<p><u>Status:</u> Alive 😊</p>
					<p><u>Last Move:</u> {playerMoveText(player)}</p>
					<p><u>Reloads:</u></p>
					<ul>
						{#each playerReloadTextArray(player) as reload}
							<li>{reload}</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
	{#if game.players.filter((p) => p.id != currentPlayerId && p.isDead).length}
		<h3>Others (Dead)</h3>
		<div class="player-cards">
			{#each game.players.filter((p) => p.id != currentPlayerId && p.isDead) as player}
				<div class="player-card dead">
					<p>
						<b
							><span class:self-text-blue={player.id == currentPlayerId}
								>{player.id}: {player.name} ({player.bot ? '🤖' : '🧑'})</span
							></b
						>
						{#if isHost}
							<button
								class="remove-button"
								on:click={() =>
									ws.send(JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } }))}
								>Remove</button
							>
						{/if}
					</p>
					<p><u>Status:</u> Dead 💀</p>
					<p><u>Last Move:</u> {playerMoveText(player)}</p>
					<p><u>Reloads:</u></p>
					<ul>
						{#each playerReloadTextArray(player) as reload}
							<li>{reload}</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
{:else if status === 'moved'}
	<h2>Waiting...</h2>
	<p>
		{game.playersMoved.length} of {game.players.filter((p) => !p.isDead && !p.bot).length} moved
	</p>
	<small
		>{game.players.filter((p) => p.isDead).length} dead (don't move) and {game.players.filter(
			(p) => p.bot && !p.isDead
		).length}
		{game.players.filter((p) => p.bot && !p.isDead).length != 1 ? 'bots' : 'bot'} (move randomly after
		all players)</small
	>
	<ul>
		{#each game.players.filter((p) => !p.isDead && !p.bot) as player}
			<li>
				<span class:self-text-blue={player.id == currentPlayerId}>{player.id}: {player.name}</span>
				({game.playersMoved.includes(player.id) ? 'moved' : 'moving'})
				{#if isHost}
					<button
						class="remove-button"
						on:click={() =>
							ws.send(JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } }))}
						>Remove</button
					>
				{/if}
			</li>
		{/each}
	</ul>
	{#if isHost}
		<button
			class="remove-button"
			on:click={() => {
				ws.send(JSON.stringify({ type: 'skip' }));
			}}>Skip</button
		>
	{/if}
{:else if status === 'pairings'}
	<button on:click={stopPairings}>Skip »</button>
	{#if pairing}
		<p class="pairingCenter">
			<span
				class:alive-text={!pairing.player.isDead}
				class:dead-text={pairing.player.isDead}
				class:self-text={pairing.player.id == currentPlayerId}
				>{pairing.player.id}: {pairing.player.name} ({pairing.player.bot ? '🤖' : '🧑'})</span
			>
			{#if pairing.player.move?.action.method == 'reload'}🔄{/if}
			<span
				style="display: inline-block;"
				class:mirror-h={moves.find((m) => m.id == pairing?.player.move?.action.id)
					?.iconFlipHorizontal}
				class:mirror-v={moves.find((m) => m.id == pairing?.player.move?.action.id)
					?.iconFlipVertical}
				class:rotate-90={moves.find((m) => m.id == pairing?.player.move?.action.id)?.rotateIcon ==
					90}
				class:rotate-negative-90={moves.find((m) => m.id == pairing?.player.move?.action.id)
					?.rotateIcon == -90}
				>{moves.find((m) => m.id == pairing?.player.move?.action.id)?.icon}</span
			>
			{#if pairing.against}
				&nbsp; vs &nbsp;
				{#if pairing.againstEachOther && pairing.against != 'everyone'}
					{#if pairing.against.move?.action.method == 'reload'}🔄{/if}
					<span
						style="display: inline-block;"
						class:mirror-h={!moves.find(
							(m) => pairing?.against != 'everyone' && m.id == pairing?.against?.move?.action.id
						)?.iconFlipHorizontal}
						class:mirror-v={moves.find(
							(m) => pairing?.against != 'everyone' && m.id == pairing?.against?.move?.action.id
						)?.iconFlipVertical}
						class:rotate-90={moves.find(
							(m) => pairing?.against != 'everyone' && m.id == pairing?.against?.move?.action.id
						)?.rotateIcon == 90}
						class:rotate-negative-90={moves.find(
							(m) => pairing?.against != 'everyone' && m.id == pairing?.against?.move?.action.id
						)?.rotateIcon == -90}
						>{moves.find(
							(m) => pairing?.against != 'everyone' && m.id == pairing?.against?.move?.action.id
						)?.icon}</span
					>
				{/if}
				{#if pairing?.against == 'everyone'}
					Everyone
				{:else}
					<span
						class:alive-text={!pairing.against.isDead}
						class:dead-text={pairing.against.isDead}
						class:self-text={pairing.against.id == currentPlayerId}
						>{pairing.against.id}: {pairing.against.name} ({pairing.against.bot
							? '🤖'
							: '🧑'})</span
					>
				{/if}
			{/if}
		</p>
	{/if}
{:else if status === 'update'}
	<h2>All Moves Executed: Update</h2>
	{#if game.players.find((p) => p.id == currentPlayerId)?.isDead}
		<h2>💀 You died!</h2>
		<p>You can spectate the game from here.</p>
	{:else}
		<h2>😊 You survived!</h2>
		<button
			on:click={() => {
				against = game.players.filter((p) => !p.isDead && p.id != currentPlayerId)[0].id;

				status = 'move';
			}}>Make Next Move</button
		>
	{/if}
	{#if pairings(game).length > 0}
		<h4>Move Pairings</h4>
		<ul>
			{#each pairings(game) as { player, against, againstEachOther }}
				<li>
					<span
						class:alive-text={!player.isDead}
						class:dead-text={player.isDead}
						class:self-text={player.id == currentPlayerId}
						>{player.id}: {player.name} ({player.bot ? '🤖' : '🧑'})</span
					>
					{#if player.move?.action.method == 'reload'}🔄{/if}
					<span
						style="display: inline-block;"
						class:mirror-h={moves.find((m) => m.id == player.move?.action.id)?.iconFlipHorizontal}
						class:mirror-v={moves.find((m) => m.id == player.move?.action.id)?.iconFlipVertical}
						class:rotate-90={moves.find((m) => m.id == player.move?.action.id)?.rotateIcon == 90}
						class:rotate-negative-90={moves.find((m) => m.id == player.move?.action.id)
							?.rotateIcon == -90}>{moves.find((m) => m.id == player.move?.action.id)?.icon}</span
					>
					{#if against}
						&nbsp; vs &nbsp;
						{#if againstEachOther && against != 'everyone'}
							{#if against.move?.action.method == 'reload'}🔄{/if}
							<span
								style="display: inline-block;"
								class:mirror-h={!moves.find(
									(m) => against != 'everyone' && m.id == against?.move?.action.id
								)?.iconFlipHorizontal}
								class:mirror-v={moves.find(
									(m) => against != 'everyone' && m.id == against?.move?.action.id
								)?.iconFlipVertical}
								class:rotate-90={moves.find(
									(m) => against != 'everyone' && m.id == against?.move?.action.id
								)?.rotateIcon == 90}
								class:rotate-negative-90={moves.find(
									(m) => against != 'everyone' && m.id == against?.move?.action.id
								)?.rotateIcon == -90}
								>{moves.find((m) => against != 'everyone' && m.id == against?.move?.action.id)
									?.icon}</span
							>
						{/if}
						{#if against == 'everyone'}
							Everyone
						{:else}
							<span
								class:alive-text={!against.isDead}
								class:dead-text={against.isDead}
								class:self-text={against.id == currentPlayerId}
								>{against.id}: {against.name} ({against.bot ? '🤖' : '🧑'})</span
							>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<br />
	<button
		class="hide-show"
		on:click={() => {
			showCards = !showCards;
		}}>{showCards ? 'Hide' : 'Show'} Cards</button
	>
	{#if showCards}
		{#if game.players.filter((p) => p.move).length}
			<h4>Moved This Turn</h4>
			<div class="player-cards">
				{#each game.players.filter((p) => p.move) as player}
					<div class="player-card" class:alive={!player.isDead} class:dead={player.isDead}>
						<p>
							<b
								><span class:self-text-blue={player.id == currentPlayerId}
									>{player.id}: {player.name} ({player.bot ? '🤖' : '🧑'})</span
								></b
							>
							{#if isHost && player.id != currentPlayerId}
								<button
									class="remove-button"
									on:click={() =>
										ws.send(JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } }))}
									>Remove</button
								>
							{/if}
						</p>
						<p><u>Status:</u> {player.isDead ? 'Dead 💀' : 'Alive 😊'}</p>
						<p><u>Move:</u> {playerMoveText(player)}</p>
						<p><u>Reloads:</u></p>
						<ul>
							{#each playerReloadTextArray(player) as reload}
								<li>{reload}</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/if}
		{#if game.players.filter((p) => !p.move).length}
			<h4>Did Not Move (Dead or Skipped)</h4>
			<div class="player-cards">
				{#each game.players.filter((p) => !p.move) as player}
					<div class="player-card" class:alive={!player.isDead}>
						<p>
							<b
								><span class:self-text-blue={player.id == currentPlayerId}
									>{player.id}: {player.name} ({player.bot ? '🤖' : '🧑'})</span
								></b
							>
							{#if isHost && player.id != currentPlayerId}
								<button
									class="remove-button"
									on:click={() =>
										ws.send(JSON.stringify({ type: 'kick-out', payload: { playerId: player.id } }))}
									>Remove</button
								>
							{/if}
						</p>
						<p><u>Status:</u> {player.isDead ? 'Dead 💀' : 'Alive 😊'}</p>
						<p><u>Reloads:</u></p>
						<ul>
							{#each playerReloadTextArray(player) as reload}
								<li>{reload}</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
{:else if status === 'results'}
	{#if !game}
		<h2>Disconnected</h2>
		<p>Sorry, you were disconnected from the server.</p>
		<button
			on:click={() => {
				if (window.location.pathname + window.location.search != '/') {
					history.pushState(null, '', '/');
				}
				window.location.reload();
			}}>Play Again</button
		>
	{:else}
		<h2>Results ({game.gameEnded ? 'Game Over' : 'Disconnected'})</h2>
		<h2>
			You {game.players.find((p) => p.id == currentPlayerId)?.isDead
				? 'died 💀 (lost)!'
				: 'survived 😊 (won)!'}
		</h2>
		<h4>All Players (🧑) Summary</h4>
		<ul>
			{#each game.players
				.filter((p) => !p.bot)
				.sort( (p1, p2) => (!p1.isDead && p2.isDead ? -1 : !p2.isDead && p1.isDead ? 1 : 0) ) as player}
				<li>
					<b
						><span class:self-text-blue={player.id == currentPlayerId}
							>{player.id}: {player.name}</span
						></b
					>
					{player.isDead ? 'died 💀 (lost)' : 'survived 😊 (won)'}
				</li>
			{/each}
		</ul>
		{#if game.players.filter((p) => p.bot).length}
			<h4>All Bots (🤖) Summary</h4>
			<ul>
				{#each game.players
					.filter((p) => p.bot)
					.sort( (p1, p2) => (!p1.isDead && p2.isDead ? -1 : !p2.isDead && p1.isDead ? 1 : 0) ) as player}
					<li>
						<b
							><span class:self-text-blue={player.id == currentPlayerId}
								>{player.id}: {player.name}</span
							></b
						>
						{player.isDead ? 'died 💀' : 'survived 😊'}
					</li>
				{/each}
			</ul>
		{/if}
		<br />
		<button
			on:click={() => {
				if (window.location.pathname + window.location.search != '/') {
					history.pushState(null, '', '/');
				}
				window.location.reload();
			}}>Play Again</button
		>
		<br />
		<h4>Final Update Details</h4>
		{#if pairings(game).length > 0}
			<h5>Move Pairings</h5>
			<ul>
				{#each pairings(game) as { player, against, againstEachOther }}
					<li>
						<span
							class:alive-text={!player.isDead}
							class:dead-text={player.isDead}
							class:self-text={player.id == currentPlayerId}
							>{player.id}: {player.name} ({player.bot ? '🤖' : '🧑'})</span
						>
						{#if player.move?.action.method == 'reload'}🔄{/if}
						<span
							style="display: inline-block;"
							class:mirror-h={moves.find((m) => m.id == player.move?.action.id)?.iconFlipHorizontal}
							class:mirror-v={moves.find((m) => m.id == player.move?.action.id)?.iconFlipVertical}
							class:rotate-90={moves.find((m) => m.id == player.move?.action.id)?.rotateIcon == 90}
							class:rotate-negative-90={moves.find((m) => m.id == player.move?.action.id)
								?.rotateIcon == -90}>{moves.find((m) => m.id == player.move?.action.id)?.icon}</span
						>
						{#if against}
							&nbsp; vs &nbsp;
							{#if againstEachOther && against != 'everyone'}
								{#if against.move?.action.method == 'reload'}🔄{/if}
								<span
									style="display: inline-block;"
									class:mirror-h={!moves.find(
										(m) => against != 'everyone' && m.id == against?.move?.action.id
									)?.iconFlipHorizontal}
									class:mirror-v={moves.find(
										(m) => against != 'everyone' && m.id == against?.move?.action.id
									)?.iconFlipVertical}
									class:rotate-90={moves.find(
										(m) => against != 'everyone' && m.id == against?.move?.action.id
									)?.rotateIcon == 90}
									class:rotate-negative-90={moves.find(
										(m) => against != 'everyone' && m.id == against?.move?.action.id
									)?.rotateIcon == -90}
									>{moves.find((m) => against != 'everyone' && m.id == against?.move?.action.id)
										?.icon}</span
								>
							{/if}
							{#if against == 'everyone'}
								Everyone
							{:else}
								<span
									class:alive-text={!against.isDead}
									class:dead-text={against.isDead}
									class:self-text={against.id == currentPlayerId}
									>{against.id}: {against.name} ({against.bot ? '🤖' : '🧑'})</span
								>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<br />
		<button
			class="hide-show"
			on:click={() => {
				showCards = !showCards;
			}}>{showCards ? 'Hide' : 'Show'} Cards</button
		>
		{#if showCards}
			{#if game.players.filter((p) => p.move).length}
				<h5>Moved This Turn</h5>
				<div class="player-cards">
					{#each game.players.filter((p) => p.move) as player}
						<div class="player-card">
							<p>
								<b
									><span class:self-text-blue={player.id == currentPlayerId}
										>{player.id}: {player.name} ({player.bot ? '🤖' : '🧑'})</span
									></b
								>
							</p>
							<p><u>Status:</u> {player.isDead ? 'Dead 💀' : 'Alive 😊'}</p>
							<p><u>Move:</u> {playerMoveText(player)}</p>
							<p><u>Reloads:</u></p>
							<ul>
								{#each playerReloadTextArray(player) as reload}
									<li>{reload}</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/if}
			{#if game.players.filter((p) => !p.move).length}
				<h5>Did Not Move (Dead or Skipped)</h5>
				<div class="player-cards">
					{#each game.players.filter((p) => !p.move) as player}
						<div class="player-card">
							<p>
								<b
									><span class:self-text-blue={player.id == currentPlayerId}
										>{player.id}: {player.name} ({player.bot ? '🤖' : '🧑'})</span
									></b
								>
							</p>
							<p><u>Status:</u> {player.isDead ? 'Dead 💀' : 'Alive 😊'}</p>
							<p><u>Reloads:</u></p>
							<ul>
								{#each playerReloadTextArray(player) as reload}
									<li>{reload}</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	{/if}
{/if}
{#if bigError != ''}
	<br />
	<p class="error">
		{#if status != 'results'}
			<b>Error:</b>
		{/if}
		{bigError}
	</p>
{/if}

<style>
	.title {
		color: black;
		text-decoration: none;
	}

	.player-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		grid-gap: 1rem;
	}

	.player-card {
		border: 1px solid black;
		border-radius: 1rem;
		padding: 1rem;
		background-color: lightgray;
	}

	.alive {
		background-color: lightgreen;
	}

	.dead {
		background-color: crimson;
	}

	.move-card {
		border: 1px solid black;
		border-radius: 1rem;
		padding: 1rem;
		background-color: lightgray;
		max-width: 600px;
	}

	button {
		border: 1px solid black;
		border-radius: 1rem;
		padding: 0.5rem;
		background-color: lightblue;
		color: black;
		cursor: pointer;
		transition: all 0.2s ease-in-out;
	}

	button:hover,
	button:focus {
		border-radius: 0.75rem;
		background-color: lightgreen;
		color: black;
	}

	button:active {
		border-radius: 0.5rem;
		background-color: yellowgreen;
	}

	button:disabled {
		background-color: gray;
		color: whitesmoke;
		border-radius: 0.35rem;
		cursor: not-allowed;
	}

	.remove-button {
		background-color: red;
		color: white;
		padding: 0.35rem;
	}

	.remove-button:hover,
	.remove-button:focus {
		background-color: darkred;
		color: white;
	}

	.remove-button:active {
		background-color: orange;
		color: black;
	}

	.clear-button,
	.clear-button:hover,
	.clear-button:focus,
	.clear-button:active {
		background-color: transparent;
		color: darkgray;
		padding: 0;
		margin-left: -1.4rem;
		margin-right: 0.5rem;
		border: none;
	}

	.hide-show,
	.hide-show:hover,
	.hide-show:focus,
	.hide-show:active {
		background-color: transparent;
		color: blue;
		font-weight: bold;
		border: none;
		padding: 0;
		font-style: italic;
	}

	input {
		border: 1px solid black;
		border-radius: 1rem;
		padding: 0.5rem;
		background-color: lightblue;
		transition: all 0.2s ease-in-out;
	}

	input:hover {
		border-radius: 0.9rem;
		background-color: yellowgreen;
	}

	input:focus {
		border-radius: 0.75rem;
		background-color: lightgreen;
	}

	input.ierror {
		border: 1px solid crimson;
	}

	.has-clear-button {
		padding-right: 1.7rem;
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

	.error {
		color: crimson;
	}

	.alive-text {
		color: green;
	}

	.dead-text {
		color: red;
	}

	.self-text {
		font-weight: bold;
		font-style: italic;
	}

	.self-text-blue {
		font-weight: bold;
		font-style: italic;
		color: blue;
	}

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

	.pairingCenter {
		text-align: center;
		margin-top: 4rem;
		font-size: 3vw;
	}
</style>
