<script lang="ts">
	import { onMount } from 'svelte';
	import { JSONRetrocycle } from '$lib/cycle';
	import type { Game, Player } from '$lib/Game';
	import { moves } from '$lib/Game';

	let ws: WebSocket;

	let game: Game;

	let isHost = false;

	let selectedMove: (typeof moves)[number];

	let currentPlayerId: number;

	let reloadSelection: (typeof game.players)[number]['reloads'];
	let against: number;

	onMount(() => {
		ws = new WebSocket('ws://localhost:8080');

		ws.onopen = () => {
			status = 'connected';
		};

		ws.onmessage = (data) => {
			const { type, payload } = JSONRetrocycle(JSON.parse(data.data));

			game = payload.game;

			console.log(type);

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
				case 'player-moved':
					status = 'move';
					break;
				case 'update':
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
	let gameId = '';
	let cap = '2';

	function playerMoveText(player: Player) {
		if (player.move) {
			return 'Used ' + player.move.action.title + direction(player);
		} else {
			return player.name + ' did nothing';
		}

		function direction(player: Player) {
			if (player.move?.action.dir == 'one') {
				return ' against ' + player.move?.direction?.name;
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
				type: key as keyof typeof player.reloads,
				amount: player.reloads[key as keyof typeof player.reloads]
			};
		});

		console.log(reloads);

		return reloads;
	}

	function reloadSelectionToArray() {
		if (!reloadSelection) return undefined;
		const reloads = Object.keys(reloadSelection).map((key) => {
			return {
				type: key as keyof typeof reloadSelection,
				amount: reloadSelection[key as keyof typeof reloadSelection]
			};
		});

		return reloads;
	}
</script>

<h1>Ultra Ball</h1>
{#if status === 'connecting'}
	<p>Connecting...</p>
{:else if status === 'connected'}
	<h2>Create/Join a Game</h2>
	<div class="game-connect">
		<label for="name">Screen Name:</label><input id="name" bind:value={name} />
		<br />
		<div class="join-options">
			<div>
				<label for="gameCode">Game Code:</label><input
					id="gameCode"
					min="1"
					type="number"
					bind:value={gameId}
				/>
				<button
					on:click={() =>
						ws.send(
							JSON.stringify({ type: 'join-game', payload: { name, gameId: parseInt(gameId) } })
						)}>Join</button
				>
			</div>
			<div>
				<label for="cap">Cap:</label><input id="cap" type="number" min="2" bind:value={cap} />
				<button
					on:click={() =>
						ws.send(JSON.stringify({ type: 'create-game', payload: { name, cap: parseInt(cap) } }))}
					>Create</button
				>
			</div>
		</div>
	</div>
{:else if status === 'lobby'}
	<h2>Lobby</h2>
	<p>Game Code: {game.id}</p>
	<p>Players:</p>
	<ul>
		{#each game.players as player}
			<li>
				{player.name} |
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
			<option value={move}>{move.title} ({move.method})</option>
		{/each}
	</select>
	{#if selectedMove && selectedMove.dir === 'one'}
		<br />
		Against:
		<select bind:value={against}>
			{#each game.players as player}
				{#if player.id !== currentPlayerId}
					<option value={player.id}>{player.id}: {player.name}</option>
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
				{reload.type}:
				{console.log(reload)}
				<input min="0" max={reload.amount} bind:value={reloadSelection[reload.type]} />
				<br />
			{/if}
		{/each}
	{/if}

	<button
		on:click={() => {
			ws.send(
				JSON.stringify({
					type: 'load-move',
					payload: {
						playerId: currentPlayerId,
						moveId: selectedMove.id,
						using: reloadSelectionToArray(),
						direction: against
					}
				})
			);
			status = 'moved';
		}}>Submit</button
	>
{:else if status === 'moved'}
	<h2>Waiting...</h2>
	<p>{game.movesDone} of {game.players.length} moved</p>
	{#if isHost}
		<button
			on:click={() => {
				ws.send(JSON.stringify({ type: 'skip' }));
			}}>Skip</button
		>
	{/if}
{:else if status === 'update'}
	<h2>All Moves Executed: Results</h2>
	<div class="player-cards">
		{#each game.players as player}
			<div class="player-card">
				<p>
					<b>{player.id}: {player.name}</b>
				</p>
				{player.isDead ? 'Dead' : 'Alive'}
				<br />
				{playerMoveText(player)}
				<br />
				<p>Reloads:</p>
				<ul>
					{#each playerReloadTextArray(player) as reload}
						<p>{reload}</p>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
	<button
		on:click={() => {
			status = 'move';
		}}>Make Next Move</button
	>
{:else if status === 'results'}
	<h2>Results</h2>
	{#each game.players as player}
		<p><b>{player.id}: {player.name}</b> {player.isDead ? 'died' : 'survived!'}</p>
	{/each}
	<button
		on:click={() => {
			status = 'connected';
			isHost = false;
			ws = new WebSocket('ws://localhost:8080');
		}}>Play Again</button
	>
{/if}

<style>
	* {
		text-align: center;
	}

	.game-connect {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-items: center;
	}

	.join-options {
		display: flex;
		flex-direction: row;
		width: 100%;
		align-items: center;
		justify-content: space-around;
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
</style>
