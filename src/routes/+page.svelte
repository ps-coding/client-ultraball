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
		ws = new WebSocket('wss://server-ultraball.onrender.com');

		ws.onopen = () => {
			status = 'connected';
		};

		ws.onclose = () => {
			status = 'results';
		};

		ws.onmessage = (data) => {
			const { type, payload } = JSONRetrocycle(JSON.parse(data.data));

			game = payload.game;

			switch (type) {
				case 'game-created':
					isHost = true;
					if (!currentPlayerId) {
						currentPlayerId = game.host.id;
					}
					status = 'lobby';
					break;
				case 'player-added':
					if (!currentPlayerId) {
						currentPlayerId = payload.newPlayerId;
					}
					status = 'lobby';
					break;
				case 'game-started':
					status = 'move';
					break;
				case 'game-updated':
					status = 'update';
					break;
				case 'game-ended':
					status = 'results';
					break;
			}
		};
	});

	let status: 'connecting' | 'connected' | 'lobby' | 'move' | 'moved' | 'update' | 'results' =
		'connecting';

	let name = '';
	let gameId = $page.url.searchParams.get('gameId');
	let cap = '2';

	let errorMessage = '';

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
				return ' on itself';
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
	<meta property="og:image" content="https://ultra.shahprasham.com/favicon.png" />
	<meta property="og:url" content="https://ultra.shahprasham.com" />
</svelte:head>

<h1>
	🌀 Ultra Ball
	{#if currentPlayerId}
		<small
			>({isHost ? 'Host' : 'Player'} &mdash;
			<i>{currentPlayerId}: {game.players.find((p) => p.id == currentPlayerId)?.name}</i>)</small
		>
	{/if}
	{#if isHost && game?.gameStarted && !game?.gameEnded}
		<button on:click={() => ws.send(JSON.stringify({ type: 'end-game' }))}>End Game</button>
	{/if}
</h1>
{#if status === 'connecting'}
	<p>Connecting...</p>
{:else if status === 'connected'}
	<h2>Create/Join a Game</h2>
	<div>
		<label for="name">Screen Name:</label><input id="name" bind:value={name} />
		<br />
		<br />
		<div>
			<div>
				<label for="gameCode">Game Code:</label><input
					id="gameCode"
					min="1"
					type="number"
					inputmode="numeric"
					bind:value={gameId}
				/>
				<button
					disabled={!name || name == '' || !gameId || parseInt(gameId) < 1}
					on:click={() => {
						if (gameId && name)
							ws.send(
								JSON.stringify({ type: 'join-game', payload: { name, gameId: parseInt(gameId) } })
							);
					}}>Join</button
				>
			</div>
			<div><i>OR</i></div>
			<div>
				<label for="cap">Cap:</label><input
					id="cap"
					type="number"
					inputmode="numeric"
					min="2"
					bind:value={cap}
				/>
				<button
					disabled={!name || name == '' || !cap || parseInt(cap) < 2}
					on:click={() =>
						ws.send(JSON.stringify({ type: 'create-game', payload: { name, cap: parseInt(cap) } }))}
					>Create</button
				>
			</div>
		</div>
	</div>
{:else if status === 'lobby'}
	<h2>Lobby</h2>
	Game Code: {game.id}
	<button
		on:click={() => {
			navigator.clipboard.writeText(game.id.toString());
		}}>📋 <small>code</small></button
	>
	<button
		on:click={() => {
			navigator.clipboard.writeText('https://ultra.shahprasham.com/?gameId=' + game.id.toString());
		}}>🔗 <small>link</small></button
	>
	<p>Players:</p>
	<ul>
		{#each game.players as player}
			<li>
				{player.id}: {player.name}
				{#if isHost}
					<button
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
		<button on:click={() => ws.send(JSON.stringify({ type: 'start-game' }))}>Start</button>
	{/if}
{:else if status === 'move'}
	<h2>Make Your Move</h2>
	Move:
	<select bind:value={selectedMove}>
		{#each moves as move}
			{#if !((move.method == 'offense' && move.needs?.edition != 'any' && !hasEnoughReloads( game.players.find((p) => p.id == currentPlayerId), move.needs )) || (move.method == 'offense' && move.needs?.edition == 'any' && !hasEnoughAnyReloads( game.players.find((p) => p.id == currentPlayerId), move.needs.amount )))}
				<option value={move}>{move.title} ({move.method})</option>
			{/if}
		{/each}
	</select>
	<br />
	<br />
	{#if selectedMove}
		<div class="move-card">
			<p><b>Move Statistics</b></p>
			<p>Name: {selectedMove.title}</p>
			<p>Direction: {selectedMove.dir}</p>
			<p>Method: {selectedMove.method}</p>
			{#if selectedMove.method == 'offense' && selectedMove.needs?.edition == 'any'}
				<p>Needs: {selectedMove.needs.amount} reloads (any)</p>
			{:else if selectedMove.method == 'offense' && selectedMove.needs?.edition}
				<p>Needs: {selectedMove.needs.amount} {selectedMove.needs.edition} reloads</p>
			{/if}
			{#if selectedMove.method == 'offense'}
				<p>Beats: {selectedMove.beats.join(', ')}</p>
			{:else if selectedMove.method == 'defense-offense'}
				<p>Reflects: {selectedMove.reflects.join(', ')}</p>
			{:else if selectedMove.method == 'defense'}
				<p>Penetrated by: {selectedMove.penetrates.join(', ')}</p>
			{/if}
		</div>
	{/if}
	{#if selectedMove && selectedMove.dir === 'one'}
		<br />
		Against:
		<select bind:value={against}>
			{#each game.players.filter((p) => !p.isDead) as player}
				{#if player.id !== currentPlayerId}
					<option value={player.id}>{player.id}: {player.name}</option>
				{/if}
			{/each}
		</select>
	{/if}
	{#if selectedMove && selectedMove.method == 'offense' && selectedMove.needs?.edition == 'any'}
		<br />
		<br />
		Using Reloads:
		<br />
		{#each reloadsArray(game.players.find((p) => p.id == currentPlayerId)) as reload}
			{#if reload.amount > 0}
				<label for="reload-{reload.edition}">{reload.edition}:</label>
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

	<p>{errorMessage != '' ? 'Error: ' + errorMessage : ''}</p>

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
						direction: against
					}
				})
			);
			status = 'moved';
			selectedMove = moves[0];
			errorMessage = '';
			reloadSelection = { knife: 0, ball: 0, bazooka: 0, spiral: 0 };
		}}>Submit</button
	>
{:else if status === 'moved'}
	<h2>Waiting...</h2>
	<p>{game.playersMoved.length} of {game.players.length} moved</p>
	<ul>
		{#each game.players as player}
			<li>
				{player.id}: {player.name} ({game.playersMoved.includes(player.id) ? 'moved' : 'moving'})
				{#if isHost}
					<button
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
			on:click={() => {
				ws.send(JSON.stringify({ type: 'skip' }));
			}}>Skip</button
		>
	{/if}
{:else if status === 'update'}
	<h2>All Moves Executed: Update</h2>
	{#if game.players.find((p) => p.id == currentPlayerId)?.isDead}
		<p>💀 You died!</p>
		<p>You can spectate the game from here.</p>
	{:else}
		<p>😊 You survived!</p>
		<button
			on:click={() => {
				status = 'move';
			}}>Make Next Move</button
		>
	{/if}
	<br />
	<br />
	<div class="player-cards">
		{#each game.players as player}
			<div class="player-card">
				<p>
					<b>{player.id}: {player.name}</b>
				</p>
				<p><u>Status:</u> {player.isDead ? 'Dead' : 'Alive'}</p>
				<p>{playerMoveText(player)}</p>
				<br />
				<p><u>Reloads:</u></p>
				<ul>
					{#each playerReloadTextArray(player) as reload}
						<li>{reload}</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
{:else if status === 'results'}
	{#if !game}
		<h2>Disconnected</h2>
		<p>Sorry, you were disconnected from the server.</p>
		<button
			on:click={() => {
				window.location.href = 'https://ultra.shahprasham.com/';
			}}>Play Again</button
		>
	{:else}
		<h2>Results</h2>
		<b
			>You {game.players.find((p) => p.id == currentPlayerId)?.isDead
				? 'died 💀 (lost)!'
				: 'survived 😊 (won)!'}</b
		>
		<br />
		<br />
		<p>All Players Summary:</p>
		<ul>
			{#each game.players as player}
				<li><b>{player.id}: {player.name}</b> {player.isDead ? 'died' : 'survived'}</li>
			{/each}
		</ul>
		<br />
		<button
			on:click={() => {
				window.location.href = 'https://ultra.shahprasham.com/';
			}}>Play Again</button
		>
		<br />
		<br />
		<p>Final Move Details:</p>
		<div class="player-cards">
			{#each game.players as player}
				<div class="player-card">
					<p>
						<b>{player.id}: {player.name}</b>
					</p>
					<p><u>Status:</u> {player.isDead ? 'Dead' : 'Alive'}</p>
					<p>{playerMoveText(player)}</p>
					<br />
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

<style>
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

	.move-card {
		border: 1px solid black;
		border-radius: 1rem;
		padding: 1rem;
		background-color: lightgray;
		max-width: 500px;
	}
</style>
