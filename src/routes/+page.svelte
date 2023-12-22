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

			if (window.location.pathname != '/?gameId=' + game.id.toString()) {
				history.pushState(null, '', '/?gameId=' + game.id.toString());
			}

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
	let cap = '';

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
		<label for="name">Screen Name: </label><input
			class="has-clear-button"
			id="name"
			bind:value={name}
		/><button
			class="clear-button"
			on:click={() => {
				name = '';
			}}
		>
			✕
		</button>
		<br />
		<br />
		<div>
			<div>
				<label for="gameCode">Game Code: </label><input
					class="hide-arrows has-clear-button"
					id="gameCode"
					min="1"
					type="number"
					inputmode="numeric"
					bind:value={gameId}
				/>
				<button
					class="clear-button"
					on:click={() => {
						history.pushState(null, '', '/');
						gameId = '';
					}}
				>
					✕
				</button>
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
			<div>
				<label for="cap">Player Cap: </label><input
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
			navigator.clipboard.writeText(window.location.href);
		}}>🔗 <small>link</small></button
	>
	<p>Players:</p>
	<ul>
		{#each game.players as player}
			<li>
				{player.id}: {player.name}
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
				<p><u>Needs</u>: {selectedMove.needs.amount} {selectedMove.needs.edition} reloads</p>
			{/if}
			{#if selectedMove.method == 'offense'}
				<p>
					<u>Beats:</u>
					{selectedMove.beats
						.map((moveId) => moves.find((move) => move.id == moveId)?.title)
						.join(', ')}
				</p>
				<p>
					{#if selectedMove.needs}
						<u>Uses:</u>
						{selectedMove.needs.amount}
						{selectedMove.needs.edition == 'any'
							? 'of any'
							: selectedMove.needs.edition + ' reloads'}
					{/if}
				</p>
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
		{#each game.players.filter((p) => !p.isDead) as player}
			<li>
				{player.id}: {player.name} ({game.playersMoved.includes(player.id) ? 'moved' : 'moving'})
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
{:else if status === 'update'}
	<h2>All Moves Executed: Update</h2>
	{#if game.players.find((p) => p.id == currentPlayerId)?.isDead}
		<p>💀 You died!</p>
		<p>You can spectate the game from here.</p>
	{:else}
		<p>😊 You survived!</p>
		<button
			on:click={() => {
				against = game.players.filter((p) => !p.isDead && p.id != currentPlayerId)[0].id;

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
				<p><u>Move:</u> {playerMoveText(player)}</p>
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
				history.pushState(null, '', '/');
				window.location.reload();
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
				history.pushState(null, '', '/');
				window.location.reload();
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
					<p><u>Move:</u> {playerMoveText(player)}</p>
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
</style>
